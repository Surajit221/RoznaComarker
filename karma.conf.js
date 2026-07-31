module.exports = function configureKarma(config) {
  config.set({
    frameworks: ['jasmine'],
    plugins: [require('karma-chrome-launcher'), require('karma-jasmine'),
      require('karma-jasmine-html-reporter')],
    customLaunchers: {
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      }
    }
  });
};
