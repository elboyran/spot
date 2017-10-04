var View = require('ampersand-view');
var templates = require('../../templates');
var app = require('ampersand-app');

module.exports = View.extend({
  template: templates.help.welcome,
  render: function () {
    this.renderWithTemplate(this);

    return this;
  }
});
