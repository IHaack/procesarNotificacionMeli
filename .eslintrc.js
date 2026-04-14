module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "google",
    "plugin:@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    // La propiedad 'project' está bien, ya que apuntas a tus dos archivos de configuración.
    project: ["./tsconfig.json", "./tsconfig.dev.json"],

    // --- ¡ESTA ES LA CORRECCIÓN CLAVE! ---
    // Le dice a ESLint que la ruta de los 'project' de arriba es relativa
    // al directorio donde se encuentra este archivo .eslintrc.js.
    // '__dirname' es una variable de Node.js que contiene la ruta del directorio actual.
    // Esto resuelve el error de "Parsing" de forma definitiva.
    tsconfigRootDir: __dirname,

    sourceType: "module",
  },
  // --- BLOQUE AÑADIDO ---
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts", ".tsx"],
      },
    },
  },

  ignorePatterns: [
    "/lib/**/*", // Ignorar archivos compilados.
    "/generated/**/*", // Ignorar archivos generados.
  ],
  plugins: ["@typescript-eslint", "import"],
  rules: {
    "quotes": ["error", "double"],
    "max-len": ["error", { "code": 120 }],

    // --- MEJORA SUGERIDA ---
    // Forzar "windows" (CRLF) puede crear conflictos en equipos con diferentes
    // sistemas operativos (macOS/Linux) y con la configuración de Git.
    // Es más seguro y estándar usar "unix" (LF).
    "linebreak-style": ["error", "unix"],

    "object-curly-spacing": "off",
    "valid-jsdoc": "off",
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
