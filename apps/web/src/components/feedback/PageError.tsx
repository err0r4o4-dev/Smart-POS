import { useLanguage } from '../../app/language';
import { Button, Loading } from '../ui/primitives';

export function RouteLoading() {
  const { t } = useLanguage();
  return (
    <main className="standalone">
      <Loading>{t('shell.openingPage')}</Loading>
    </main>
  );
}

export function PageError() {
  const { t } = useLanguage();

  return (
    <main className="standalone" role="alert">
      <h1>{t('shell.unableToDisplayThisPage')}</h1>
      <p>{t('shell.reloadThePageIfYouWereSaving')}</p>
      <Button onClick={() => window.location.reload()}>
        {t('shell.reloadPage')}
      </Button>
    </main>
  );
}
