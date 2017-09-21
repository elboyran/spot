var setTheme = function (themeNumber) {
  document.body.style.setProperty('--themeColour1', themeColours[themeNumber][0]);
  document.body.style.setProperty('--themeColour2', themeColours[themeNumber][1]);
  if (themeNumber < Object.keys(themeColours).length) {
  document.body.style.setProperty('--themeColourButton', themeColours[themeNumber + 1][0]);
  } else {
  document.body.style.setProperty('--themeColourButton', themeColours[1][0]);
  }
};
var switchTheme = function () {
  if (themeNumber < Object.keys(themeColours).length) {
    themeNumber++;
  } else {
    themeNumber = 1;
  }
  setTheme(themeNumber);
};
var themeNumber = 1;
window.onload = function(){setTheme(themeNumber)};