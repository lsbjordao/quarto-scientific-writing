// Entry point: exposes wink-nlp as window globals for the scientific-writing extension
var winkNLP = require('wink-nlp');
var winkModel = require('wink-eng-lite-web-model');

window.winkNLP = winkNLP;
window.winkEngLiteWebModel = winkModel;
