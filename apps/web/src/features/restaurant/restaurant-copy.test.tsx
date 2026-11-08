import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { CommandState } from './RestaurantUI';

it('explains an uncertain save and safe retry in English', () => {
  renderInEnglish(
    <CommandState
      command={{ error: null, isSuccess: false, uncertain: true }}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    'The save result is unknown. Save again to check the same request; this will not create a duplicate.',
  );
});
