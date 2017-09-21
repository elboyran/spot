// This app view is responsible for rendering all content that goes into
// <html>. It's initted right away and renders itself on DOM ready.
var app = require('ampersand-app');
// var setFavicon = require('favicon-setter');
var View = require('ampersand-view');
var ViewSwitcher = require('ampersand-view-switcher');
var localLinks = require('local-links');
var domify = require('domify');
var templates = require('../templates');

// For the help
var Tour = require('intro.js');

function checkConnection (model) {
  if (model.sessionType === 'server' && !model.isConnected) {
    app.message({
      text: 'Trying to connect to database ' + window.location.hostname,
      type: 'error'
    });
  }

  // retry
  window.setTimeout(function () {
    checkConnection(model);
  }, 4000);
}

var setTheme = function (themeNumber) {
  document.body.style.setProperty('--themeColour1', themeColours[themeNumber][0]);
  document.body.style.setProperty('--themeColour2', themeColours[themeNumber][1]);
  document.body.style.setProperty('--themeColour3', themeColours[themeNumber][2]);
  document.body.style.setProperty('--themeColour4', themeColours[themeNumber][3]);
  document.body.style.setProperty('--themeColour5', themeColours[themeNumber][4]);
  if (themeNumber < Object.keys(themeColours).length) {
  document.body.style.setProperty('--themeColourButton', themeColours[themeNumber + 1][0]);
  } else {
  document.body.style.setProperty('--themeColourButton', themeColours[1][0]);
  }
};

var themeColours = {
  // The keys iterate from 1 upwards
  // The array contains the primary and secondary colours of the theme
  "1":["#474655","#756A76","#B0656C","#E4923E","#F47835"],
  "2":["#332D39","#65677A","#8EA0B2","#ABD7CA","#F5ECD6"],
  "3":["#4E453D","#6DA79E","#9BBCAD","#C8CBB2","#CA723C"],
  "4":["#7D8861","#AA7E61","#D7A778","#CE9D60","#8E8E8D"],
  "5":["#5A2735","#586166","#D3AB83","#F2A44F","#EF5C0F"],
  "6":["#3C6062","#5DBCB2","#CAEEE2","#E8DFB2","#FCA042"],
};

var themeNumber = 1;
window.onload = function(){setTheme(themeNumber)};

module.exports = View.extend({
  template: templates.main,
  autoRender: true,
  initialize: function () {
    this.pageName = 'main';
    // this marks the correct nav item selected
    this.listenTo(app, 'page', this.handleNewPage);

    // periodically check database connection
    checkConnection(this.model);

    this.model.on('change:isConnected', function () {
      if (this.model.isConnected) {
        app.message({
          text: 'Connected to  ' + window.location.hostname,
          type: 'ok'
        });
      }
    }, this);
  },
  events: {
    'click a[href]': 'handleLinkClick',
    'click [data-hook~=tour-button]': 'startTour',
    'click [data-hook~=menu-button]': 'handleMenu',
    'click [data-hook~=switchTheme]': 'switchTheme'
  },
  startTour: function () {
    var intro = Tour.introJs();
    this.expandMenu();
    intro.start();
  },
  handleMenu: function () {
    var drawer = this.queryByHook('main-drawer');
    drawer.classList.toggle('is-expanded');
  },
  expandMenu: function () {
    var drawer = this.queryByHook('main-drawer');
    // window.alert(drawer.classList.contains("is-expanded"));
    drawer.classList.add('is-expanded');
  },
  render: function () {
    // some additional stuff we want to add to the document head
    document.head.appendChild(domify(templates.head()));
    document.title = 'Spot';

    // main renderer
    this.renderWithTemplate(this);

    // init and configure our page switcher
    this.pageSwitcher = new ViewSwitcher(this.queryByHook('page-container'), {
      show: function (newView, oldView) {
        document.scrollTop = 0;

        // store an additional reference, just because
        app.currentPage = newView;
      }
    });

    // setting a favicon for fun (note, it's dynamic)
    // setFavicon('/favicon.ico');
    return this;
  },

  handleNewPage: function (view) {
    // tell the view switcher to render the new page
    this.pageSwitcher.set(view);

    // update responsive layout (Material Design)
    window.componentHandler.upgradeDom();

    // second rendering pass; absolute sizes in pixels is now available for
    // widgets that need them (ie. the SVG elements)
    if (view.renderContent) {
      view.renderContent();
    }
  },

  // Handles all `<a>` clicks in the app not handled
  // by another view. This lets us determine if this is
  // a click that should be handled internally by the app.
  handleLinkClick: function (e) {
    // This module determines whether a click event is
    // a local click (making sure the for modifier keys, etc)
    // and dealing with browser quirks to determine if this
    // event was from clicking an internal link. That we should
    // treat like local navigation.
    var localPath = localLinks.pathname(e);

    if (localPath) {
      e.preventDefault();
      app.navigate(localPath);
    }
  },
  
  switchTheme: function () {
    if (themeNumber < Object.keys(themeColours).length) {
      themeNumber++;
    } else {
      themeNumber = 1;
    }
    setTheme(themeNumber);
  }

});
