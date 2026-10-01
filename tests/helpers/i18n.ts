import i18n, { i18nHazir } from '../../src/i18n';

/** Loads a language and namespaces so translated components render without suspending. */
export async function dilHazirla(dil: string, adAlanlari: string[] = []) {
  await i18nHazir;
  await i18n.loadLanguages(dil);
  await i18n.changeLanguage(dil);
  await i18n.loadNamespaces(['ortak', 'hatalar', ...adAlanlari]);
}
