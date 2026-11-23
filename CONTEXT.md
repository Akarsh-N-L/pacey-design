# Pacey design engine: glossary

- **Brand**: a name, 2–5 colours, two fonts, and a line on its voice. Everything a design may use.
- **Request**: the one-line ask, e.g. "Instagram post for our Sunday brunch launch".
- **Plan**: the model's JSON answer: which Layout, the headline, the supporting line, and which Brand colour and font does what. Never contains markup.
- **Layout**: a fixed, code-built arrangement the Plan selects and fills.
- **Size**: one of the two output shapes, 1080×1350 or 1080×1920. Both come from one Plan.
- **Design**: a Plan rendered at one Size.
- **Brand check**: the pass/fail audit of a Design against its Brand (colours, contrast, fonts, margins).
- **Repair**: sending a rejected Plan's reasons back to the model for another attempt.
