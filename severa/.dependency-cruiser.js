module.exports = {
  forbidden: [
    {
      name: 'no-domain-to-infrastructure',
      comment: 'Los archivos del dominio no deben depender de infraestructura ni de adaptadores.',
      severity: 'error',
      from: {
        path: '^src/domain'
      },
      to: {
        path: '^src/infrastructure'
      }
    },
    {
      name: 'no-domain-to-adapters',
      comment: 'Los archivos del dominio no deben depender de application/adapters ni infraestructura.',
      severity: 'error',
      from: {
        path: '^src/domain'
      },
      to: {
        path: '^src/application/adapters|^src/infrastructure'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    includeOnly: '^src'
  }
};
