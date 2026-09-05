// ESLint (flat config): strict-пресет — typescript-eslint recommended + обязательный
// no-unused-vars / no-explicit-any (аудит 05.09, решение пользователя: strict).
// libs/ — вендорные исходники (webamp/ani-cursor), не линтуем.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'libs/**', 'public/**', 'data/**'] },
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // в игре компоненты-приложения + хелперы живут в одном файле — правило не применимо
      'react-refresh/only-export-components': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // noUncheckedIndexedAccess в tsconfig уже ловит; non-null assertion используется осознанно (rng.int)
      '@typescript-eslint/no-non-null-assertion': 'off',
      // React Compiler-диагностика рассчитана на проекты С React Compiler; здесь рефы осознанно
      // используются как кеши (wm-геометрия, drag), а setState-в-effect — часть спецификации
      // анимации вклада (аудит 05.09)
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
);
