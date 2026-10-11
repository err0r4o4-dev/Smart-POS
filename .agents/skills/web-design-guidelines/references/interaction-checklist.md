# Interaction Checklist

Select only states and inputs affected by the requested change.

| Concern         | Evidence to inspect                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- |
| Keyboard        | Tab order, visible focus, Enter/Space behavior, Escape and dialog return focus            |
| Forms           | Labels, required/invalid feedback, preserved input and pending submissions                |
| Pointer/touch   | Actions available without hover, usable targets and no competing scroll gestures          |
| Responsive      | Reflow rather than shrink; long Thai/Latin text, zoom, table overflow and action priority |
| Status          | Loading, empty, denied, dependency error, disabled, pending and success                   |
| Motion          | Reduced-motion behavior, readable feedback and no disruptive layout jump                  |
| Visual identity | Existing tokens, local fonts, icons and Apple-inspired SmartPOS controls                  |

A code inspection is not a screenshot or interaction test. State which evidence is available and what is not verified. Do not perform an application-wide audit or redesign for a local request.
