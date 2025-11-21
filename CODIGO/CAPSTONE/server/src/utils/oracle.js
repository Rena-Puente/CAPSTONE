function readOracleClob(value) {
  if (value === null || value === undefined) {
    return Promise.resolve('');
  }

  if (typeof value === 'string') {
    return Promise.resolve(value);
  }

  if (typeof value === 'object' && typeof value.getData === 'function') {
    return new Promise((resolve, reject) => {
      value.setEncoding('utf8');

      let data = '';

      value.on('data', (chunk) => {
        data += chunk;
      });

      value.on('end', () => resolve(data));
      value.on('close', () => resolve(data));
      value.on('error', (error) => reject(error));
    });
  }

  return Promise.resolve(String(value));
}

module.exports = {
  readOracleClob
};
