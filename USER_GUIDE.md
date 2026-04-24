# TokenFlow User Guide (Plain Language)

Welcome to TokenFlow! This practical guide explains what each feature does, when to use it, and how things work behind the scenes in simple, everyday language.

## What's New in This Version?

TokenFlow has been freshly updated with powerful new enterprise and security features:
- **Enterprise Audit Tab:** A brand new workspace to upload your own workflows and datasets, run automated AI (Gemini) analysis, and get combined security and fairness reports you can save and export.
- **Autonomous Supervisor Agent:** A smart automated watcher that runs during your workflows to catch, pause, or stop bad behavior instantly.
- **Red-Team Simulation:** An easy one-click mode to test your system against hacking attempts and security attacks.
- **Incident Replay & Export:** Built-in tools to "replay" past workflow incidents and download them as clean JSON/PDF reports for compliance and auditing.
- **Improved Navigation:** Simplified top menus (Workflow Management, Monitor, Dataset Management, and Enterprise Audit) to make getting around much easier.

---

## What is TokenFlow?

TokenFlow is like an ultra-secure airport checkpoint for your AI agents. When AI agents try to perform actions (like read a file, make a decision, or send data), TokenFlow makes sure they are only doing exactly what they are allowed to do. 

It helps teams:
- Watch AI actions step-by-step using "tokens" (digital permission slips).
- Instantly block unauthorized access (like an AI trying to steal passwords).
- Audit datasets to ensure AI decisions are fair to all groups of people.
- Test the system against simulated attacks to prove it's safe.

---

## Main Navigation: What Each Tab Does

### 1) Home
The starting point. It introduces TokenFlow, tells the story of why it's needed (like preventing rogue AI incidents), and gives you quick shortcuts to jump into the action.

### 2) Workflow Management
This is where the magic happens. It's the core area where you run and test AI tasks. It has several sub-tabs:
- **Mock Workflows:** Pick pre-made test scenarios (like a normal safe workflow or a "Double Agent" attack) and hit play to see how the system reacts.
- **Uploaded Workflows:** Upload your own custom JSON files to test your specific AI processes.
- **Token Chain:** A visual tracker that shows you exactly what the AI is doing, step-by-step. You'll see tokens being created, used, and burned. There is also a "Kill Switch" here to instantly stop a rogue workflow.
- **Testbench:** A testing lab where you can run deep security and logic tests.
- **Workflow Score:** A scorecard that grades your workflow's security based on how well it behaved.
- **Red-Team Simulation:** Think of this as a fire drill. Run automatic, simulated attacks to see if TokenFlow can catch them.
- **Replay & Export:** Did an attack happen? Go here to rewind the tape, see exactly what went wrong step-by-step, and download a professional PDF/JSON report to show your security team.

### 3) Monitor
Your command center for watching live activity.
- **Overview:** A dashboard showing how many workflows are running, if any were blocked, and the overall system health.
- **Security:** If an AI agent does something suspicious, it gets flagged and sent here. A human can look at the evidence and decide to either approve the action or permanently block it.

### 4) Dataset Management
Where you make sure your AI models are fair and unbiased.
- **Fairness:** Upload a dataset (like a list of loan applicants) and tell the system what lines to check (like gender or age). TokenFlow will analyze the data to see if the AI is accidentally favoring one group over another. It also offers "threshold mitigation" to help fix the bias!
- **Score:** A report card for how fair and well-governed your datasets are.

### 5) Enterprise Audit (NEW)
The ultimate tool for companies. This tab brings everything together in one place:
- **Upload & Context:** Upload your workflow and your dataset. Gemini AI will analyze your uploads and tell you what it thinks your goal is. Don't know how to format your files? Click the "Format Guide" button for a simple cheat sheet!
- **Workflow Security:** Tests your uploaded workflow for security holes.
- **Fairness Analysis:** Checks your uploaded dataset for bias. You can now track *multiple* protected attributes (like both Gender and Age) at the same time.
- **Combined Report:** Generates a massive, beautiful summary of both your security and fairness results. 
- **Time-Saving Bonus:** TokenFlow automatically saves your past Enterprise Audits. You can use the dropdown menu to reload a past report at any time, saving you from doing the work twice!

### 6) About
A quick explainer page about the real-world Google "Double Agent" incident that inspired TokenFlow, showing you exactly why this security is necessary.

---

## How to Upload Custom Workflows

If you want to bring your own workflow into the platform, head to **Workflow Management > Uploaded Workflows** (or use the **Enterprise Audit** tab). 

Your workflow needs to be a `.json` file formatted like a simple recipe. 

### Format Example
```json
{
  "name": "Sample Data Pipeline",
  "description": "Reads data and processes output.",
  "steps": [
    {
      "action": "READ_OBJECT",
      "service": "gcs",
      "resource": "data/input.json",
      "actionVerb": "read"
    }
  ]
}
```
**Rules to remember:**
- The `action` must be a known command like `READ_OBJECT`, `WRITE_OBJECT`, or `CALL_INTERNAL_API`.
- An invalid service like `source-control` will trigger a security alarm and block the workflow immediately!

---

## How to Use the Fairness Checker

The Fairness module mathematically proves whether your AI's decisions are fair across different groups of people. It does not guess—it calculates exact numbers.

### Step-by-Step Guide
1. Go to **Dataset Management > Fairness** (or the **Enterprise Audit** tab).
2. Upload your data file (CSV or JSON). Maximum 50 MB or 1 million rows.
3. **Map your columns:** Tell the system which column in your file is the "Record ID", which is the "Target Outcome" (what should have happened), and which is the "Predicted Outcome" (what the AI actually chose).
4. **Pick Protected Attributes:** Add groups you want to check for bias (e.g., column: `gender`, reference group: `Female`). You can add multiple at once!
5. **Run Analysis:** TokenFlow will crunch the numbers and flag any violations.
6. **Mitigate:** If needed, run the mitigation tool to digitally adjust the decision thresholds and make the outcomes fairer.

### Dataset File Rules
- **Binary Labels:** The Target and Predicted outcomes must be simple answers like `0 or 1`, `true or false`, or `yes or no`.
- **Protected Groups:** The column you check for bias must have at least two different groups in it (for example, it can't be a list where everyone is "Male"; there must be a mix).
- **Scores needed for Mitigation:** If you want the system to *fix* the bias, your dataset MUST have a `predicted_score` column (typically a decimal number like `0.85`).

---

## Dealing with Security Blocks

If the **Autonomous Supervisor Agent** detects a problem or if a fairness check fails terribly, it can "block" your mission workflows. 

- **Shadow Mode:** The system will secretly complain and log the error, but let the workflow finish.
- **Enforce Mode:** The system will immediately pause or kill the workflow. Security is hardened.

If your workflow gets paused, simply navigate to **Monitor > Security**. Here you can read exactly *why* the block happened. As a human, you can hit "Resume" if you trust the workflow, or "Revoke" to kill it forever.

---

## For Developers Running Locally

If you are running TokenFlow on your own machine:
- Make sure `VITE_API_BASE_URL` is empty in your `.env` file so the local proxy handles requests.
- Don't worry if you're missing an API key initially—the app is built with clever fallback modes so it runs perfectly without breaking. 

Happy auditing with TokenFlow!
