// express-async-errors no publica tipos propios (side-effect only): parchea
// Router/Application de Express para que un handler async que rechaza su
// promesa llame a next(err) automáticamente, en vez de crashear el proceso
// con una excepción no capturada (bug real cerrado en Sprint 15 — ver el
// error-handler global en app.ts).
declare module 'express-async-errors';
