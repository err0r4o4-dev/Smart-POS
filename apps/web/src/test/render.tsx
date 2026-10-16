import {
  render as renderReact,
  type RenderOptions,
} from '@testing-library/react';
import type { ReactElement } from 'react';
import { LanguageProvider } from '../app/language';
import type { Language } from '../i18n';

function renderInLanguage(
  ui: ReactElement,
  options: RenderOptions = {},
  language: Language = 'th',
) {
  const Wrapper = options.wrapper;
  return renderReact(ui, {
    ...options,
    wrapper: ({ children }) => (
      <LanguageProvider initialLanguage={language}>
        {Wrapper ? <Wrapper>{children}</Wrapper> : children}
      </LanguageProvider>
    ),
  });
}
export function render(ui: ReactElement, options?: RenderOptions) {
  return renderInLanguage(ui, options);
}
export function renderInEnglish(ui: ReactElement, options?: RenderOptions) {
  return renderInLanguage(ui, options, 'en');
}
