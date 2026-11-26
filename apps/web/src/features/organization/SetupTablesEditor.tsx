import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';
import type { SetupTablesInput } from './setup-api';

export function SetupTablesEditor({
  value,
  onChange,
  savedTableCount,
}: {
  value: SetupTablesInput;
  onChange: (value: SetupTablesInput) => void;
  savedTableCount: number;
}) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const sourceZone = value.zones[0] ?? {
    name: t('organization.setupDefaultZone'),
  };
  const zones = value.zones.length ? value.zones : [sourceZone];

  useEffect(() => {
    if (!focusTarget) return;
    rootRef.current
      ?.querySelector<HTMLInputElement | HTMLButtonElement>(
        `[data-setup-focus="${focusTarget}"]`,
      )
      ?.focus();
  }, [focusTarget]);

  const updateTable = (
    index: number,
    change: Partial<SetupTablesInput['tables'][number]>,
  ) =>
    onChange({
      ...value,
      qr_enabled: value.tables.length > 0,
      tables: value.tables.map((table, current) =>
        current === index ? { ...table, ...change } : table,
      ),
    });

  const addTable = () => {
    let number = value.tables.length + 1;
    let name = t('organization.setupDefaultTable', { number });
    while (value.tables.some((table) => table.name === name)) {
      name = t('organization.setupDefaultTable', { number: ++number });
    }
    onChange({
      ...value,
      qr_enabled: true,
      zones,
      tables: [
        ...value.tables,
        {
          name,
          zone: sourceZone.name,
          zone_code: sourceZone.code,
          seats: 2,
        },
      ],
    });
    setFocusTarget(`table-${value.tables.length}`);
  };

  return (
    <div className="setup-tables-editor" ref={rootRef}>
      <p className="setup-hint">{t('organization.setupTablesHint')}</p>
      {value.tables.length ? (
        <table className="setup-tables-grid" role="table">
          <caption className="setup-visually-hidden">
            {t('organization.metaTables')}
          </caption>
          <thead role="rowgroup">
            <tr role="row">
              <th scope="col" role="columnheader">
                {t('organization.setupTableName')}
              </th>
              <th scope="col" role="columnheader">
                <span className="setup-visually-hidden">
                  {t('organization.setupTableActions')}
                </span>
              </th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            {value.tables.map((table, index) => (
              <tr key={table.code ?? index} role="row">
                <td role="cell">
                  <label className="setup-field">
                    <span className="setup-table-mobile-label">
                      {t('organization.setupTableName')}
                    </span>
                    <input
                      aria-label={t('organization.setupTableNameNumber', {
                        number: index + 1,
                      })}
                      data-setup-focus={`table-${index}`}
                      value={table.name}
                      required
                      onChange={(event) =>
                        updateTable(index, { name: event.target.value })
                      }
                    />
                  </label>
                </td>
                <td role="cell">
                  <Button
                    type="button"
                    className="button-secondary"
                    aria-label={t('organization.setupRemoveTable', {
                      number: index + 1,
                    })}
                    disabled={Boolean(table.code) || index < savedTableCount}
                    title={
                      table.code || index < savedTableCount
                        ? t('organization.setupSavedTablesHint')
                        : undefined
                    }
                    onClick={() => {
                      onChange({
                        ...value,
                        qr_enabled: value.tables.length > 1,
                        tables: value.tables.filter(
                          (_, current) => current !== index,
                        ),
                      });
                      setFocusTarget('add-table');
                    }}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="setup-tables-empty" role="status">
          {t('organization.setupTablesEmpty')}
        </p>
      )}
      <div className="setup-table-actions">
        <Button
          type="button"
          className="button-secondary"
          data-setup-focus="add-table"
          disabled={value.tables.length >= 500}
          onClick={addTable}
        >
          <Plus size={16} aria-hidden="true" />
          {t('organization.setupAddTable')}
        </Button>
      </div>
      {(savedTableCount > 0 || value.tables.some((table) => table.code)) && (
        <p className="setup-hint">{t('organization.setupSavedTablesHint')}</p>
      )}
    </div>
  );
}
