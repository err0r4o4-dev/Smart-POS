import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { render, renderInEnglish } from '../../test/render';
import { HelpDropdown } from './HelpDropdown';

function HelpHarness() {
  const location = useLocation();
  return (
    <>
      <input aria-label="Draft" defaultValue="Unsaved store name" />
      <HelpDropdown />
      <output aria-label="Location">
        {location.pathname}
        {location.search}
      </output>
      <button type="button">Outside</button>
    </>
  );
}

function renderHelp() {
  renderInEnglish(
    <MemoryRouter initialEntries={['/setup?step=2']}>
      <HelpHarness />
    </MemoryRouter>,
  );
}

it('opens inline help without navigating or losing unsaved form values', () => {
  renderHelp();
  const trigger = screen.getByRole('button', { name: 'Help' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('region', { name: 'Store help' })).toBeVisible();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const topic = screen.getByRole('button', { name: 'Get your store ready' });
  fireEvent.click(topic);
  expect(topic).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText(/Select the organization and branch/i)).toBeVisible();
  expect(screen.getByLabelText('Location')).toHaveTextContent('/setup?step=2');
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved store name');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(topic);
  expect(topic).toHaveAttribute('aria-expanded', 'false');
});

it('closes on a second trigger click', () => {
  renderHelp();
  const trigger = screen.getByRole('button', { name: 'Help' });
  fireEvent.click(trigger);
  fireEvent.click(trigger);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('closes on Escape and restores trigger focus', () => {
  renderHelp();
  const trigger = screen.getByRole('button', { name: 'Help' });
  fireEvent.click(trigger);
  const topic = screen.getByRole('button', { name: 'Get your store ready' });
  topic.focus();
  fireEvent.keyDown(topic, { key: 'Escape' });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('ignores inside pointer events and closes on outside pointer events', () => {
  renderHelp();
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Get your store ready' }),
  );
  expect(screen.getByRole('region')).toBeVisible();
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('closes when keyboard focus leaves the dropdown', () => {
  renderHelp();
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  fireEvent.blur(screen.getByRole('button', { name: 'Get your store ready' }), {
    relatedTarget: screen.getByRole('button', { name: 'Outside' }),
  });
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('does not submit a surrounding form', () => {
  let submissions = 0;
  renderInEnglish(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submissions += 1;
      }}
    >
      <HelpDropdown />
    </form>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Help' }));
  fireEvent.click(screen.getByRole('button', { name: 'Get your store ready' }));
  expect(submissions).toBe(0);
});

it('renders Thai help using the selected language', () => {
  render(<HelpDropdown />);
  fireEvent.click(screen.getByRole('button', { name: 'คู่มือ' }));
  expect(
    screen.getByRole('region', { name: 'คู่มือใช้งานร้าน' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'เตรียมร้านให้พร้อม' }));
  expect(screen.getByText(/เลือกองค์กรและสาขาที่ต้องการทำงาน/)).toBeVisible();
});
