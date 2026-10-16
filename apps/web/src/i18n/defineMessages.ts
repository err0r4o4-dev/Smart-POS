type Resource = { [key: string]: string | Resource };
type TranslationShape<T> = {
  [K in keyof T]: T[K] extends string ? string : TranslationShape<T[K]>;
};

export function defineMessages<const T extends Resource>(messages: {
  th: T;
  en: TranslationShape<T>;
}) {
  return messages;
}
