import { useState } from 'react';
import { Button, Loading } from '../../components/ui/primitives';
import { Field } from '../purchasing/SupplyUI';
import { CatalogError } from '../catalog/CatalogUI';
import type { POSItem, POSPage, POSTerminal } from '../../lib/pos-api';
import {
  validReturnQuantity,
  type ReturnableSale,
  type StockDisposition,
} from '../../lib/returns-api';
import type {
  AdjustmentQuote,
  SaleAdjustment,
} from '../../lib/adjustments-api';
import { useReturnsCommand, useReturnsQuery } from './returns-hooks';
import type { AdjustmentsCopy } from './adjustments-copy';
import { BatchPicker, type BatchSelection } from '../quality/BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';

export function AdjustmentBuilder({
  sale,
  editing,
  reversal,
  path,
  text,
  command,
  saved,
}: {
  sale: ReturnableSale;
  editing: SaleAdjustment | null;
  reversal: boolean;
  path: string;
  text: AdjustmentsCopy;
  command: ReturnType<typeof useReturnsCommand>;
  saved: (doc: SaleAdjustment) => void;
}) {
  const [reason, setReason] = useState(editing?.reason ?? ''),
    [terminal, setTerminal] = useState(editing?.terminal_id ?? ''),
    [search, setSearch] = useState(''),
    [barcode, setBarcode] = useState(''),
    [quote, setQuote] = useState<AdjustmentQuote | null>(null);
  const [lines, setLines] = useState(() =>
    sale.items.map((item) => {
      const prior = editing?.return_document.items.find(
        (line) => line.original_sale_item_id === item.id,
      );
      return {
        original_sale_item_id: item.id,
        batch_id: prior?.batch_id ?? null,
        batch_verified: false,
        quantity: prior?.quantity ?? (reversal ? item.returnable_quantity : ''),
        disposition: (prior?.disposition ??
          'RESTOCK_SELLABLE') as StockDisposition,
        destination_location_id:
          prior?.destination_location_id ?? item.stock_location_id,
      };
    }),
  );
  const [replacements, setReplacements] = useState<
    { item: POSItem; quantity: string; batch?: BatchSelection }[]
  >(
    () =>
      editing?.replacement_items.map((item) => ({
        item,
        quantity: item.quantity,
      })) ?? [],
  );
  const terminals = useReturnsQuery<POSPage<POSTerminal>>(
    `/pos/terminals?branch_id=${sale.branch_id}&status=ACTIVE&page_size=100`,
  );
  const locations = useReturnsQuery<
    POSPage<{ id: string; name: string; type: string; status: string }>
  >(`/inventory/locations?branch_id=${sale.branch_id}&page_size=100`);
  const products = useReturnsQuery<POSPage<POSItem>>(
    !reversal && terminal
      ? `/pos/products?${new URLSearchParams({ terminal_id: terminal, search, barcode, page_size: '10' })}`
      : '',
  );
  const input = {
    original_sale_id: sale.id,
    reason,
    terminal_id: reversal ? '' : terminal,
    revision: editing?.revision ?? 0,
    items: lines
      .filter(
        (line) =>
          line.quantity && line.quantity !== '0' && line.quantity !== '0.000',
      )
      .map((line) => ({
        ...line,
        ...(line.disposition === 'NO_STOCK_RETURN' ? untrackedBatch : {}),
        destination_location_id:
          line.disposition === 'NO_STOCK_RETURN'
            ? null
            : line.destination_location_id,
      })),
    replacements: replacements.map((line) => ({
      variant_id: line.item.variant_id,
      quantity: line.quantity,
      ...(line.batch ?? {
        batch_id: line.item.batch_id ?? null,
        batch_verified: false,
      }),
    })),
  };
  const valid =
    input.items.length > 0 &&
    input.items.every((line) =>
      validReturnQuantity(
        line.quantity,
        sale.items.find((item) => item.id === line.original_sale_item_id)!
          .returnable_quantity,
      ),
    ) &&
    !!reason.trim() &&
    (reversal || (!!terminal && replacements.length > 0));
  function updateLine(index: number, field: string, value: string) {
    setQuote(null);
    setLines(
      lines.map((line, current) =>
        current === index ? { ...line, [field]: value } : line,
      ),
    );
  }
  async function preview() {
    const value = await command.run<AdjustmentQuote>(`${path}/quote`, input);
    if (value) setQuote(value);
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && window.confirm(text.review))
          void command
            .run<SaleAdjustment>(
              editing ? `${path}/${editing.id}` : path,
              input,
              editing ? 'PATCH' : 'POST',
            )
            .then((value) => {
              if (value) saved(value);
            });
      }}
    >
      <p className="returns-reference">
        {sale.sale_number} · {sale.grand_total} THB
      </p>
      <Field label={text.reason}>
        <textarea
          required
          maxLength={2000}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setQuote(null);
          }}
        />
      </Field>
      {sale.items.map((item, index) => (
        <div key={item.id} className="returns-line">
          <strong>
            {item.product_name} · {item.sku}
          </strong>
          <p>
            {text.remaining}: {item.returnable_quantity} /{' '}
            {item.returned_quantity} · {item.unit_price} THB
          </p>
          <Field label={`${text.quantity} ${item.sku}`}>
            <input
              inputMode="decimal"
              disabled={reversal}
              value={lines[index].quantity}
              onChange={(event) =>
                updateLine(index, 'quantity', event.target.value)
              }
            />
          </Field>
          <Field label={`${text.disposition} ${item.sku}`}>
            <select
              value={lines[index].disposition}
              onChange={(event) =>
                updateLine(index, 'disposition', event.target.value)
              }
            >
              {[
                'RESTOCK_SELLABLE',
                'QUARANTINE',
                'DAMAGED',
                'NO_STOCK_RETURN',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          {lines[index].disposition !== 'NO_STOCK_RETURN' && (
            <BatchPicker
              variant={item.variant_id}
              branch={sale.branch_id}
              label={`Return Batch/Lot ${item.sku}`}
              value={lines[index]}
              change={(selection) => {
                setLines(
                  lines.map((line, position) =>
                    position === index ? { ...line, ...selection } : line,
                  ),
                );
                setQuote(null);
              }}
            />
          )}
          {lines[index].disposition !== 'NO_STOCK_RETURN' && (
            <Field label={`${text.destination} ${item.sku}`}>
              <select
                value={lines[index].destination_location_id}
                onChange={(event) =>
                  updateLine(
                    index,
                    'destination_location_id',
                    event.target.value,
                  )
                }
              >
                <option value="">{text.choose}</option>
                {locations.data?.items
                  .filter((location) => location.status === 'ACTIVE')
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name} · {location.type}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
      ))}
      <CatalogError error={locations.error || terminals.error} />
      {!reversal && (
        <>
          <h3>{text.replacements}</h3>
          <Field label={text.terminal}>
            <select
              required
              value={terminal}
              onChange={(event) => {
                setTerminal(event.target.value);
                setReplacements([]);
                setQuote(null);
              }}
            >
              <option value="">{text.choose}</option>
              {terminals.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={text.replacementSearch}>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Field label={text.barcode}>
            <input
              value={barcode}
              maxLength={80}
              onChange={(event) => setBarcode(event.target.value)}
            />
          </Field>
          <CatalogError error={products.error} />
          {terminal && products.isPending && <Loading>{text.loading}</Loading>}
          {products.data?.items.map((item) => (
            <div key={item.variant_id} className="returns-line">
              <p>
                {item.product_name} · {item.sku} · {item.unit_price} THB ·{' '}
                {text.stock}: {item.available}
              </p>
              <Button
                type="button"
                disabled={
                  !item.saleable ||
                  replacements.some(
                    (line) => line.item.variant_id === item.variant_id,
                  )
                }
                onClick={() => {
                  setReplacements([...replacements, { item, quantity: '1' }]);
                  setQuote(null);
                }}
              >
                {text.add} {item.sku}
              </Button>
            </div>
          ))}
          {replacements.map((line, index) => (
            <div key={line.item.variant_id} className="returns-line">
              <strong>
                {line.item.product_name} · {line.item.sku}
              </strong>
              <Field label={`${text.replacementQuantity} ${line.item.sku}`}>
                <input
                  required
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(event) => {
                    setReplacements(
                      replacements.map((value, current) =>
                        current === index
                          ? { ...value, quantity: event.target.value }
                          : value,
                      ),
                    );
                    setQuote(null);
                  }}
                />
              </Field>
              <BatchPicker
                variant={line.item.variant_id}
                branch={sale.branch_id}
                location={
                  terminals.data?.items.find((item) => item.id === terminal)
                    ?.stock_location_id
                }
                sellableOnly
                label={`Replacement Batch/Lot ${line.item.sku}`}
                value={line.batch ?? untrackedBatch}
                change={(selection) => {
                  setReplacements(
                    replacements.map((value, position) =>
                      position === index
                        ? { ...value, batch: selection }
                        : value,
                    ),
                  );
                  setQuote(null);
                }}
              />
              <Button
                type="button"
                onClick={() => {
                  setReplacements(
                    replacements.filter((_, current) => current !== index),
                  );
                  setQuote(null);
                }}
              >
                {text.remove}
              </Button>
            </div>
          ))}
        </>
      )}
      <Button
        type="button"
        disabled={command.busy || !valid}
        onClick={() => void preview()}
      >
        {text.quote}
      </Button>
      {quote && (
        <div role="status">
          <p>
            {text.credit}: {quote.return_credit} THB
          </p>
          <p>
            {text.total}: {quote.replacement_total} THB
          </p>
          <p>
            {text.difference}: {quote.net_difference} THB ·{' '}
            {quote.net_difference === '0.00'
              ? text.zero
              : quote.net_difference.startsWith('-')
                ? text.refund
                : text.collect}
          </p>
        </div>
      )}
      <Button type="submit" disabled={command.busy || !valid || !quote}>
        {text.save}
      </Button>
    </form>
  );
}
