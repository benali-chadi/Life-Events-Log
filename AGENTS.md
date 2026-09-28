# Design before substantial implementation

Before substantial implementations or redesigns, prepare a short Markdown design
note and discuss it with the user before writing implementation code. Keep the
note understandable and proportional to the work; small routine changes do not
need a full design document.

Cover the following sections:

| Section | What to discuss |
| --- | --- |
| Goal and example | The purpose of the module, feature, or additional functionality. What should happen for an actual user or file? |
| Flow | A small sequence of steps, including failure and cancellation. |
| Responsibilities | What the library does versus what our code does. |
| Choices | Alternatives and their code complexity, memory, disk, and speed tradeoffs. |
| Interface | A few function signatures, not full implementations. The responsibilities of key interface functions or classes. |
| First implementation slice | The smallest useful piece we will build and verify. |

## Additional rules

- The document does not prove everything is settled. Explicitly identify open
  questions and distinguish them from agreed decisions.
- Agreeing on an interface must not silently imply agreeing on a complex
  implementation underneath it. Discuss substantial internal complexity before
  introducing it, even when the public interface stays unchanged.
- Keep the agreed design note in the repository and update it as decisions change.
  Do not expand the implementation beyond the agreed scope without discussion.
