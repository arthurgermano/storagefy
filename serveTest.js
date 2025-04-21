const serve = require('serve');
serve('docs', {
  port: 4321,
  single: true,
  public: '/storagefy/',
});