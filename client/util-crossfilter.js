/**
 * Utility functions for crossfilter datasets
 * We roughly follow the crossfilter design of dimensions and groups, but we
 * add an extra step to allow transformations on the data
 * This is needed because crossfilter places a few constraints on the dimensions
 * and group operations: dimensions are ordered and one dimensional, and
 * the grouping operation conforms with the dimension ordering
 * 1. a datum is turned into a base value using baseValFn
 * 2. a base value is transformed into a value (possbily using exceedances,
 *     percentiles, category remapping etc.) using valueFn; this value is then
 *     taken as the crossfilter dimension value
 * 3. a value is grouped using groupFn; this corresponds to a crossfilter group
 *
 * @module client/util-crossfilter
 * @see baseValueFn, valueFn, groupFn
 */
var misval = require('./misval');
var moment = require('moment-timezone');
var math = require('mathjs');

/**
 * @typedef {Object} SubgroupValue
 * @property {number} count The count of the number of elements in this subgroup
 * @property {number} sum The sum of all elements in this subgroup
 */

/**
 * @typedef {Object.<string, SubgroupValue>} SubgroupHash
 */

/**
 * @typedef {Object[]} UnpackedGroups
 * @property {string} key The group key
 * @property {SubgroupHash} value Hash containing subgroups
 */

/**
 * crossfilter dimensions are implemented as arrays for categorial facets,
 * to implement multiple labels/tags per datapoint.
 * This can result in quite messy datastructure returned by group.all()
 * This function re-formats the data to be more regular
 * @param {Object[]} groups - Array of crossfilter groups to unpack
 * @param {(string|string[])} groups.key - The group key as a string or array of strings
 * @param {SubgroupHash} groups.value - A hash mapping subgroup keys on subgroup values
 * @returns {UnpackedGroups} newGroups - Unpacked array of groups
 */
function unpackArray (groups) {
  function merge (key, values) {
    Object.keys(values).forEach(function (subgroup) {
      if (newKeys[key]) {
        newKeys[key][subgroup] = newKeys[key][subgroup] || {count: 0, sum: 0};
        newKeys[key][subgroup].count += values[subgroup].count;
        newKeys[key][subgroup].sum += values[subgroup].sum;
      } else {
        newKeys[key] = {};
        newKeys[key][subgroup] = {count: values[subgroup].count, sum: values[subgroup].sum};
      }
    });
  }

  var newKeys = {};
  groups.forEach(function (group) {
    if (group.key instanceof Array) {
      group.key.forEach(function (subkey) {
        merge(subkey, group.value);
      });
    } else {
      merge(group.key, group.value);
    }
  });

  var newGroups = [];
  Object.keys(newKeys).forEach(function (key) {
    newGroups.push({key: key, value: newKeys[key]});
  });

  return newGroups;
}

// TODO: cummulative sums
/**
 * Reduce a SubgroupValue to a single number
 *
 * @callback reduceCB
 * @param {SubgroupValue} d SubgroupValue
 * @returns {number} Reduced value
 */
/**

/**
 * Returns a function that for further reducing the crossfilter group
 * to a single value, depending on sum/count/average settings of facet
 * @param {Facet} facet - The facet for which to create the reduction function
 * @returns {reduceCB} The required reduction function
 */
function reduceFn (facet) {
  if (facet.reduceSum) {
    /**
     * @callback subgroupSum
     * @param {SubgroupValue} d
     * @returns {number} sum
     */
    return function (d) {
      return d.sum;
    };
  } else if (facet.reduceCount) {
    /**
     * @callback subgroupCount
     * @param {SubgroupValue} d
     * @returns {number} count
     */
    return function (d) {
      return d.count;
    };
  } else if (facet.reduceAverage) {
    /**
     * @callback subgroupAverage
     * @param {SubgroupValue} d
     * @returns {number} d.sum/d.count
     */
    return function (d) {
      if (d.count > 0) {
        return d.sum / d.count;
      } else {
        return 0.0;
      }
    };
  } else {
    console.error('Reduction not implemented for this facet', facet);
  }
  return null;
}

// ********************************************************
// Facet transform utility function
// ********************************************************

/**
 * Returns the base value for a datum
 *
 * @callback baseValueCB
 * @param {Object} d Raw data record
 * @returns {Object} base value
 */

/**
 * Base value for given facet
 * @param {Facet} facet
 * @returns {baseValueCB} Base value function for this facet
 */
function baseValueFn (facet) {
  var accessor;
  if (facet.isProperty) {
    // Nested properties can be accessed in javascript via the '.'
    // so we implement it the same way here.
    var path = facet.accessor.split('.');

    if (path.length === 1) {
      // Use a simple direct accessor, as it is probably faster than the more general case
      // and it was implemented already
      accessor = function (d) {
        var value = misval;
        if (d.hasOwnProperty(facet.accessor)) {
          value = d[facet.accessor];

          if (facet.misval.indexOf(value) > -1 || value === null) {
            value = misval;
          }
        }

        if (facet.isCategorial) {
          if (value instanceof Array) {
            return value;
          } else {
            return [value];
          }
        } else if (facet.isContinuous && value !== misval) {
          return parseFloat(value);
        }
        return value;
      };
    } else {
      // Recursively follow the crumbs to the desired property
      accessor = function (d) {
        var i = 0;
        var value = d;

        for (i = 0; i < path.length; i++) {
          if (value && value.hasOwnProperty(path[i])) {
            value = value[path[i]];
          } else {
            value = misval;
            break;
          }
        }

        if (facet.misval.indexOf(value) > -1 || value === null) {
          value = misval;
        }
        if (facet.isCategorial) {
          if (value instanceof Array) {
            return value;
          } else {
            return [value];
          }
        } else if (facet.isContinuous) {
          return parseFloat(value);
        }
        return value;
      };
    }
  } else if (facet.isMath) {
    var formula = math.compile(facet.accessor);

    accessor = function (d) {
      try {
        var value = formula.eval(d);
        return value;
      } catch (e) {
        return misval;
      }
    };
  }

  if (facet.isTime) {
    if (facet.isDuration) {
      /**
       * Duration parsing:
       * 1. If no format is given, the string parsed using
       *    the [ISO 8601 standard](https://en.wikipedia.org/wiki/ISO_8601)
       * 2. If a format is given, the string is parsed as float and interpreted in the given units
       **/
      var durationFormat = facet.baseValueTimeFormat;
      if (durationFormat.length === 0) {
        return function (d) {
          var value = accessor(d);
          if (value !== misval) {
            var m;
            m = moment.duration(value);
            return m;
          }
          return misval;
        };
      } else {
        return function (d) {
          var value = accessor(d);
          if (value !== misval) {
            var m;
            m = moment.duration(parseFloat(value), durationFormat);
            return m;
          }
          return misval;
        };
      }
    } else if (facet.isDatetime) {
      /**
       * Time parsing:
       * 1. moment parses the string using the given format, but defaults to
       *    the [ISO 8601 standard](https://en.wikipedia.org/wiki/ISO_8601)
       * 2. Note that if the string contains timezone information, that is parsed too.
       * 3. The time is transformed to requested timezone, defaulting the locale default
       *    when no baseValueTimeZone is set
       **/
      var timeFormat = facet.baseValueTimeFormat;
      var timeZone = facet.baseValueTimeZone;

      // use default ISO 8601 format
      if (timeFormat.length === 0) {
        timeFormat = moment.ISO_8601;
      }

      // use default locale timezone
      if (timeZone.length === 0) {
        timeZone = moment.tz.guess();
      }

      return function (d) {
        var value = accessor(d);
        if (value !== misval) {
          var m;
          m = moment.tz(value, timeFormat, timeZone);
          return m;
        }
        return misval;
      };
    } else {
      console.error('Time base type not supported for facet', facet);
    }
  } else if (facet.isContinuous || facet.isCategorial) {
    return accessor;
  } else {
    console.error('Facet kind not implemented in baseValueFn: ', facet);
  }
}

/**
 * Returns the transformed value from a base value
 *
 * @callback valueCB
 * @param {Object} d Base value
 * @returns {Object} Transformed value
 */

/**
 * Create a function that returns the transformed value for this facet
 * @param {Facet} facet
 * @returns {valueCB} Value function for this facet
 */
function valueFn (facet) {
  if (facet.isConstant) {
    return function () { return '1'; };
  } else if (facet.isContinuous) {
    return continuousValueFn(facet);
  } else if (facet.isCategorial) {
    return categorialValueFn(facet);
  } else if (facet.isTime) {
    return timeValueFn(facet);
  }

  console.error('facetValueFn not implemented for facet type: ', facet);
}

function continuousValueFn (facet) {
  // get base value function
  var baseValFn = baseValueFn(facet);

  // Parse numeric value from base value
  if (facet.transformNone) {
    return function (d) {
      var val = baseValFn(d);
      if (isNaN(val) || val === Infinity || val === -Infinity) {
        return misval;
      }
      return val;
    };

  // Calulate percentiles, and setup mapping
  } else if (facet.transformPercentiles) {
    var percentiles = facet.getPercentiles();
    var npercentiles = percentiles.length;

    return function (d) {
      var val = baseValFn(d);
      if (val === misval) {
        return misval;
      }
      if (val < percentiles[0].x) {
        return 0;
      } else if (val > percentiles[npercentiles - 1].x) {
        return 100;
      }

      var i = 0;
      while (val > percentiles[i].x) {
        i++;
      }
      return percentiles[i].p;
    };

  // Calulate exceedances, and setup mapping
  } else if (facet.transformExceedances) {
    var exceedances = facet.getExceedances();
    var nexceedances = exceedances.length;

    return function (d) {
      var val = baseValFn(d);

      if (val === misval) {
        return misval;
      }

      if (val <= exceedances[0].x) {
        return exceedances[0].e;
      }

      if (val >= exceedances[nexceedances - 1].x) {
        return exceedances[nexceedances - 1].e;
      }

      var i = 0;
      while (val > exceedances[i].x) {
        i++;
      }
      return exceedances[i].e;
    };
  }
}

function categorialValueFn (facet) {
  // get base value function
  var baseValFn = baseValueFn(facet);

  return function (d) {
    // Map categories to a set of user defined categories
    var relabel = function (hay) {
      // default to the raw value
      var val = hay;

      // Parse facet.categories to match against category_regexp to find group
      facet.categories.some(function (cat) {
        if (cat.category === hay) {
          val = cat.group;
          return true;
        } else {
          return false;
        }
      });
      return val;
    };

    var val = baseValFn(d);

    var i;
    for (i = 0; i < val.length; i++) {
      val[i] = relabel(val[i]);
    }

    // sort alphabetically
    val.sort();

    return val;
  };
}

function timeValueFn (facet) {
  // get base value function
  var baseValFn = baseValueFn(facet);
  var durationFormat = facet.transformTimeUnits;
  var referenceTimeZone = facet.transformTimeZone;
  var referenceMoment = null;

  // time zone for conversions etc.
  if (facet.transformTimeZone.length === 0) {
    referenceTimeZone = moment.tz.guess();
  }

  // construct reference time for duration <-> datetime conversion
  if (facet.transformTimeReference.length > 0) {
    referenceMoment = moment.tz(facet.transformTimeReference, referenceTimeZone);
  }

  if (facet.isDatetime) {
    if (referenceMoment) {
      // datetime -> duration
      return function (d) {
        return baseValFn(d).diff(referenceMoment, durationFormat, true);
      };
    } else if (facet.transformTimeZone.length > 0) {
      // change time zone
      return function (d) {
        return baseValFn(d).tz(referenceTimeZone);
      };
    } else {
      // no change
      return function (d) {
        return baseValFn(d);
      };
    }
  } else if (facet.isDuration) {
    if (referenceMoment) {
      // duration -> datetime
      return function (d) {
        var n = referenceMoment.clone();
        return n.add(baseValFn(d));
      };
    } else if (facet.transformTimeUnits.length > 0) {
      // change units
      return function (d) {
        return baseValFn(d).as(durationFormat);
      };
    } else {
      // no change
      return function (d) {
        return baseValFn(d);
      };
    }
  } else {
    console.error('Time type not implemented for facet', facet);
  }
}

/**
 * Returns the grouped value for a transformed value
 *
 * @callback groupCB
 * @param {Object} d Transformed value
 * @returns {Object} Group
 */

/**
 * Create a function that returns the group value for this facet
 * @param {Facet} facet
 * @returns {groupCB} Group function for this facet
 */
function groupFn (facet) {
  if (facet.displayConstant) {
    return function () { return '1'; };
  } else if (facet.displayContinuous) {
    return continuousGroupFn(facet);
  } else if (facet.displayCategorial) {
    return categorialGroupFn(facet);
  } else if (facet.displayTime) {
    return timeGroupFn(facet);
  }

  console.error('Group function not implemented for facet', facet);
}

function continuousGroupFn (facet) {
  var bins = facet.bins();
  var nbins = bins.length;

  // FIXME: use some bisection to speed up
  return function (d) {
    var i;
    if (d < bins[0].group[0] || d > bins[nbins - 1].group[1]) {
      return misval;
    }

    i = 0;
    while (d > bins[i].group[1]) {
      i++;
    }
    return bins[i].label;
  };
}

function timeGroupFn (facet) {
  // Round the time to the specified resolution
  // see:
  //  http://momentjs.com/docs/#/manipulating/start-of/
  //  http://momentjs.com/docs/#/displaying/as-javascript-date/
  var timeBin = facet.groupingTimeFormat;
  var scale = function (d) {
    if (d === misval) {
      return d;
    }
    var datetime = d.clone();
    var result = datetime.startOf(timeBin);
    return result;
  };
  scale.domain = function () {
    return [moment(facet.minvalAsText), moment(facet.maxvalAsText)];
  };
  return scale;
}

function categorialGroupFn (facet) {
  // Don't do any grouping; that is done in the step from base value to value.
  // Matching of facet value and group could lead to a different ordering,
  // which is not allowed by crossfilter
  return function (d) {
    return d;
  };
}

module.exports = {
  baseValueFn: baseValueFn,
  valueFn: valueFn,
  groupFn: groupFn,

  unpackArray: unpackArray,
  reduceFn: reduceFn
};
