# Module flows

Plain-language flow diagrams of every GS HRMS module, based on the frontend prototype (`gs-hrms`).
Read these before building or testing a module.

| File                                                     | What                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **[GS-HRMS-Module-Flows.pdf](GS-HRMS-Module-Flows.pdf)** | Everything in one document, with cover and contents                                   |
| [pdf/](pdf/)                                             | One PDF per module (00 overview … 14 reports)                                         |
| [src/](src/)                                             | The source of each chapter (HTML + Mermaid diagrams) — **edit these, never the PDFs** |

Each chapter has the same parts: **In short** (3–5 lines) → who uses it and which frontend screens →
diagrams → rules → a red **"Not in the frontend yet"** box listing what the backend must add or the lead must decide.
Box colours show who does each step (Employee, Team Lead, HR, Admin, Candidate, System).

## Updating

1. Edit `flow/src/<NN-module>.html`. Diagrams are [Mermaid](https://mermaid.js.org) inside `<pre class="mermaid">`;
   colour a step with `:::emp`, `:::lead`, `:::hr`, `:::admin`, `:::cand`, `:::sys`, `:::bad` or `:::good`.
2. Start the PDF service and build:
   ```bash
   docker compose up -d gotenberg
   npm run flow:pdf            # all chapters + the combined PDF
   npm run flow:pdf -- 08      # just one chapter while editing
   ```
3. Commit the source and the regenerated PDFs together.

When the backend changes a flow (for example a new approval step), update the chapter in the same pull request.
