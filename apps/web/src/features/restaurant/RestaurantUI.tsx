import { useLanguage } from '../../app/language';
import { errorMessage } from '../../i18n';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState, Loading } from '../../components/ui/primitives';

export function QueryState({
  query,
}: {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'error' | 'refetch'>;
}) {
  const { language } = useLanguage();
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState
        message={errorMessage(language, query.error)}
        retry={() => {
          void query.refetch();
        }}
      />
    );
  return null;
}

export function CommandState({
  command,
}: {
  command: { error: unknown; isSuccess: boolean; uncertain: boolean };
}) {
  const { t, language } = useLanguage();
  return (
    <>
      {command.error ? (
        <ErrorState message={errorMessage(language, command.error)} />
      ) : null}
      {command.uncertain ? (
        <p role="status">{t('restaurant.uncertainSave')}</p>
      ) : null}
      {command.isSuccess ? <p role="status">{t('restaurant.saved')}</p> : null}
    </>
  );
}
