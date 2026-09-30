// ESLint 9 (flat config) del api. Prioriza reglas que atrapan bugs y fallas de seguridad
// (SQL armado con texto, console con datos personales) sobre el estilo.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// SQL sin parámetros: todo va por las plantillas etiquetadas ($queryRaw`...`, Prisma.sql).
const RAW_SQL_MESSAGE = 'SQL armado con texto: usa $queryRaw`...` / Prisma.sql con parámetros.';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '.uploads', 'seed-assets'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-restricted-properties': [
        'error',
        { property: '$queryRawUnsafe', message: RAW_SQL_MESSAGE },
        { property: '$executeRawUnsafe', message: RAW_SQL_MESSAGE },
        { object: 'Prisma', property: 'raw', message: RAW_SQL_MESSAGE },
      ],
      // Las otras puertas al SQL armado con texto: new Prisma.Sql([...]), el runtime de Prisma
      // (raw, sqltag, Sql) y el acceso calculado prisma[nombre](...), que esquiva la regla de arriba.
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.object.name='Prisma'][callee.property.name='Sql']", message: RAW_SQL_MESSAGE },
        { selector: "NewExpression[callee.name='Sql']", message: RAW_SQL_MESSAGE },
        {
          selector: "MemberExpression[computed=true][property.type!='Literal'][object.name=/^(prisma|tx|client)$/]",
          message: 'Acceso calculado al cliente de Prisma: usa el método por su nombre (así se revisa el SQL).',
        },
        {
          selector: "MemberExpression[computed=true][property.type!='Literal'][object.property.name='prisma']",
          message: 'Acceso calculado al cliente de Prisma: usa el método por su nombre (así se revisa el SQL).',
        },
        {
          // (prisma as unknown as Record<...>)[nombre]
          selector:
            "MemberExpression[computed=true][property.type!='Literal'][object.type='TSAsExpression']:has(Identifier[name=/^(prisma|tx|client)$/])",
          message: 'Acceso calculado al cliente de Prisma: usa el método por su nombre (así se revisa el SQL).',
        },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@prisma/client/runtime', '@prisma/client/runtime/*'], message: RAW_SQL_MESSAGE }] },
      ],
      // El api registra con pino (redacta cookies y tokens); console se salta esa redacción.
      'no-console': 'error',
      // Lo que TypeScript ya revisa; '_' marca lo descartado a propósito.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // La CLI habla con quien la corre en la terminal: su salida es console.
    files: ['src/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Las pruebas no corren en producción; imprimen resúmenes útiles al leer la salida del CI.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    languageOptions: { globals: { ...globals.jest } },
    rules: { 'no-console': 'off' },
  },
);
