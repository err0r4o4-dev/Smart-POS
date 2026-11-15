import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { render, renderInEnglish } from '../../test/render';
import { SetupAddressFields } from './SetupAddressFields';
import { validateStoreProfile } from './setup-validation';

function AddressHarness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SetupAddressFields
        value={value}
        onChange={setValue}
        errors={validateStoreProfile({
          name: 'Store',
          contact_phone: '',
          address: value,
        })}
      />
      <output aria-label="Saved address">{value}</output>
    </>
  );
}

it('filters dependent Thai address options and fills postcode without changing house number', () => {
  render(<AddressHarness />);
  expect(screen.getByLabelText('อำเภอ / เขต')).toBeDisabled();
  expect(screen.getByLabelText('ตำบล / แขวง')).toBeDisabled();
  fireEvent.change(screen.getByLabelText('บ้านเลขที่ / เลขที่ตั้งร้าน'), {
    target: { value: '99/9' },
  });
  fireEvent.change(screen.getByLabelText('จังหวัด'), {
    target: { value: 'กรุงเทพมหานคร' },
  });
  expect(screen.getByLabelText('อำเภอ / เขต')).toHaveAccessibleDescription(
    'เลือกอำเภอ / เขต',
  );
  expect(
    within(screen.getByLabelText('อำเภอ / เขต')).queryByRole('option', {
      name: 'เมืองเชียงใหม่',
    }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('อำเภอ / เขต'), {
    target: { value: 'พระนคร' },
  });
  fireEvent.change(screen.getByLabelText('ตำบล / แขวง'), {
    target: { value: 'พระบรมมหาราชวัง' },
  });
  expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveValue('10200');
  expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveAttribute('readonly');
  expect(screen.getByLabelText('บ้านเลขที่ / เลขที่ตั้งร้าน')).toHaveValue(
    '99/9',
  );
  expect(screen.getByLabelText('Saved address')).toHaveTextContent(
    'แขวง พระบรมมหาราชวัง, เขต พระนคร',
  );
  fireEvent.change(screen.getByLabelText('อำเภอ / เขต'), {
    target: { value: 'ดุสิต' },
  });
  expect(screen.getByLabelText('ตำบล / แขวง')).toHaveValue('');
  expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('จังหวัด'), {
    target: { value: 'เชียงใหม่' },
  });
  expect(screen.getByLabelText('อำเภอ / เขต')).toHaveValue('');
  expect(screen.getByLabelText('ตำบล / แขวง')).toBeDisabled();
  expect(screen.getByLabelText('บ้านเลขที่ / เลขที่ตั้งร้าน')).toHaveValue(
    '99/9',
  );
  fireEvent.change(screen.getByLabelText('จังหวัด'), { target: { value: '' } });
  expect(screen.getByLabelText('Saved address')).toHaveTextContent('99/9');
});

it('restores structured saved fields and English labels', () => {
  renderInEnglish(
    <AddressHarness initial="99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200" />,
  );
  expect(screen.getByLabelText('House number / store address')).toHaveValue(
    '99/9',
  );
  expect(screen.getByLabelText('Province')).toHaveValue('กรุงเทพมหานคร');
  expect(screen.getByLabelText('District')).toHaveValue('พระนคร');
  expect(screen.getByLabelText('Subdistrict')).toHaveValue('พระบรมมหาราชวัง');
  expect(screen.getByLabelText('Postal code')).toHaveValue('10200');
});

it('exposes required address fields and associated errors', () => {
  render(<AddressHarness />);
  for (const label of [
    'บ้านเลขที่ / เลขที่ตั้งร้าน',
    'จังหวัด',
    'อำเภอ / เขต',
    'ตำบล / แขวง',
  ]) {
    expect(screen.getByLabelText(label)).toBeRequired();
    expect(screen.getByLabelText(label)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription();
  }
  expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveAttribute(
    'aria-required',
    'true',
  );
  expect(screen.getByLabelText('รหัสไปรษณีย์')).toHaveAccessibleDescription(
    'กรอกรหัสไปรษณีย์ 5 หลัก',
  );
});
