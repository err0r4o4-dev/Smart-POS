# Frontend Test Matrix

| Change            | Focused cases                                                                    |
| ----------------- | -------------------------------------------------------------------------------- |
| Form              | Valid submit, invalid input, recoverable server error, pending/duplicate submit  |
| Query screen      | Loading, empty, error, retry, authorized scope change and stale response         |
| Navigation        | Correct destination, denied access presentation and return/deep-link behavior    |
| Dialog/action     | Keyboard open/close, focus restoration and cancellation without a business write |
| Retail mutation   | Exact payload/units, conflict display and correct cache invalidation             |
| Responsive layout | Rendered viewport/input checks when an authorized browser environment exists     |

Frontend visibility is not server authorization. A mocked UI success is not a real database transaction or tenant-isolation acceptance result. Keep tests scoped to the requested behavior.
