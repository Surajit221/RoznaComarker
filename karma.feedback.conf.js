module.exports = function configureFeedbackTests(config) {
  config.set({
    frameworks: ['jasmine'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
    ],
    customLaunchers: {
      ChromeHeadlessFeedback: {
        base: 'Chrome',
        flags: ['--headless=new', '--disable-gpu', '--disable-dev-shm-usage', '--no-sandbox'],
      },
    },
    browsers: ['ChromeHeadlessFeedback'],
  });
};
