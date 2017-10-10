var PageView = require('./base');
var templates = require('../templates');
var Spot = require('spot-framework');
var app = require('ampersand-app');

// For the help
var Tour = require('intro.js');

module.exports = PageView.extend({
  initialize: function () {
    this.pageName = 'home';
    var introWelcome = Tour.introJs();

    introWelcome.setOptions({
      'showStepNumbers': false,
      'showBullets': false,
      'showProgress': false,
      steps: [
        {
          intro: templates.help.welcome()
        }
      ]
    });

    // add a flag when we're done
    introWelcome.oncomplete(function () {
      window.localStorage.setItem('doneWelcome', 'welcomed');
    });

    // add a flag when we exit
    introWelcome.onexit(function () {
      window.localStorage.setItem('doneWelcome', 'welcomed');
    });

    var doneWelcome = window.localStorage.getItem('doneWelcome') === 'welcomed';
    if (doneWelcome) {
      console.log('Did the tour already!');
    } else {
      console.log('Starting the tour.');
      introWelcome.start();
    }
    introWelcome.start();
  },
  pageTitle: 'Home',
  template: templates.home,
  events: {
    'click [data-hook~=demo-session]': 'demoSession'
  },
  demoSession: function () {
    console.log('Starting the demo session');

    app.message({
      text: 'Starting the demo session. Please wait.',
      type: 'ok'
    });

    var getJSON = function (url, callback) {
      var xhr = new window.XMLHttpRequest();




      xhr.open('GET', url, true);
      xhr.responseType = 'json';

      // xhr.addEventListener("progress", function (evt) {
      //     //console.log(evt.lengthComputable); // false
      //     var contentLength;
      //     if (evt.lengthComputable) {
      //         contentLength = evt.total;
      //     }
      //     else {
      //       console.log(evt.target.getResponseHeader);
      //         //contentLength = evt.target.getResponseHeader('x-decompressed-content-length');
      //         contentLength = evt.target.getResponseHeader("X-Content-Length");
      //         //contentLength = evt.target.response.length;
      //   }
      //
      //   var percentComplete = evt.loaded / contentLength;
      //   //progressElem.html(Math.round(percentComplete * 100) + "%");
      //   //console.log(Math.round(percentComplete * 100) + "%\n"); // false
      //   console.log(evt.loaded + " of " + contentLength + "%\n");
      //
      // }, false);

      xhr.onload = function () {
        var status = xhr.status;
        if (status === 200) {
          callback(null, xhr.response);
        } else {
          callback(status, xhr.response);
        }
      };
      xhr.send();
    };



    var sessionUrl = 'https://raw.githubusercontent.com/fdiblen/spot-data/87ed77fc3f3585e7b8d4c164ffe7aae486761962/demo_session.json';

    getJSON(sessionUrl,
    function (err, data) {
      if (err !== null) {
        window.alert('Something went wrong: ' + err);
      } else {
        app.me = new Spot(data);

        if (data.sessionType === 'server') {
          app.me.connectToServer(data.address);
        } else if (data.sessionType === 'client') {
          // add data from the session file to the dataset
          data.datasets.forEach(function (d, i) {
            app.me.datasets.models[i].crossfilter.add(d.data);
            app.me.datasets.models[i].isActive = false; // we'll turn it on later
          });

          data.datasets.forEach(function (d, i) {
            if (d.isActive) {
              app.me.toggleDataset(app.me.datasets.models[i]);
            }
          });
        }

        app.message({
          text: 'Demo session was started succesfully',
          type: 'ok'
        });

        // and automatically go to the analyze page
        app.navigate('analyze');
      }
    });
  }

});
