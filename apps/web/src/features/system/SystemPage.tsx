import { useLanguage } from '../../app/language';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldX, Unplug } from 'lucide-react';
import { Tag } from '../../components/ui/primitives';

export function SystemPage({ forbidden = false }: { forbidden?: boolean }) {
  const { t } = useLanguage();

  const Icon = forbidden ? ShieldX : Unplug;
  return (
    <main id="main-content" className="standalone">
      <Icon size={54} strokeWidth={1.3} aria-hidden="true" />
      <Tag tone="amber">
        {forbidden ? '403 · ACCESS DENIED' : '404 · NOT FOUND'}
      </Tag>
      <h1 tabIndex={-1}>
        {forbidden
          ? t('system.thisSpaceIsRestricted')
          : t('system.nothingOnThisShelf')}
      </h1>
      <p>
        {forbidden
          ? t('system.yourAccountOrRoleCannotAccessThis')
          : t('system.thisPageDoesNotExistOrIs')}
      </p>
      <Link to="/workspace" className="button">
        <ArrowLeft size={18} aria-hidden="true" />
        {t('pos.backToWorkspace')}
      </Link>
    </main>
  );
}
