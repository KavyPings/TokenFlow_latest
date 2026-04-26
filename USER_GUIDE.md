# TokenFlow User Guide

Welcome to **TokenFlow**! This guide will help you understand what TokenFlow is and how you can use it to ensure your AI and automated systems are secure, fair, and unbiased.

---

## What is TokenFlow?

TokenFlow is an "operating system" for automated decision-making. Today, AI bots and automated workflows make big decisions—who gets a loan, who gets hired, or whose account gets flagged for fraud.

If these systems learn from biased data, they can accidentally amplify discrimination, or if they are compromised, they can leak sensitive data. TokenFlow sits in the middle and acts as a strict guard. It uses two main engines:
1. **Security Token Chain**: Every single step an AI takes requires a cryptographically signed "token." If the AI tries to go off-script, the system blocks it.
2. **Fairness Audit**: It analyzes the data the AI is using to see if certain groups are being unfairly disadvantaged, and provides tools to automatically fix those biases.

---

## Getting Started

When you open TokenFlow, you'll see a navigation bar at the top with access to different tools.

### 1. Workflow Security (Running AI Workflows)
*Go to the **Workflow** tab at the top.*

This area lets you see how TokenFlow monitors AI tasks in real time.

- **Mock Workflows**: We’ve provided built-in scenarios (like a loan approval process). You can pick a safe workflow to see how things normally run, or an "attack" workflow to watch TokenFlow catch and block malicious behavior.
- **Uploaded Workflows**: If you have your own AI workflow defined in a JSON file, you can upload it here and run it through the same secure token engine. 
- **Token Chain**: Once a workflow starts, switch to this tab. You will see a glowing chain of events. Every dot represents an action the AI requested.
  - **Blue dots**: Minted tokens (requesting permission).
  - **Green dots**: Consumed tokens (action successfully completed).
  - **Red / Yellow dots**: Blocked, revoked, or flagged actions. 

### 2. Monitoring Alerts
*Go to the **Monitor** tab at the top.*

Here you can manage everything happening across the system.
- **Dashboard**: Gives you a quick overview of total executions, tokens burned, and system health status.
- **Security Log**: If TokenFlow intercepts a workflow (for example, if a workflow tried to access unauthorized data), it pauses and ends up here. You can look at exactly what went wrong and either "Clear" the logs or investigate the incident.

### 3. Governance & Fairness (Dataset Management)
*Go to the **Governance** tab at the top.*

This is where you make sure your AI isn't discriminating. TokenFlow has a complete Fairness Audit engine.

- **Fairness Audit**: 
  1. **Upload Dataset**: Upload a CSV containing past decisions made by your system.
  2. **Map Columns**: Tell TokenFlow which column is the "Target" (e.g., whether a loan was approved) and which columns are "Protected Attributes" (e.g., gender, race, age).
  3. **Run Analysis**: TokenFlow will test the data.
  4. **Understanding Metrics**: TokenFlow will check things like **Statistical Parity** (do groups get approved at equal rates?) and **Disparate Impact** (checking the 80% rule). Don't worry—the interface explains if a metric is good (green) or risky (red).
  5. **AI Report**: Click the "Generate AI Report" button. Our Gemini AI integration will read all the complex math and write a simple, plain-English executive summary of the biases in your data.
  6. **Mitigation**: If the dataset has high risk, you can hit "Run Mitigation." TokenFlow will calculate new fairness thresholds to balance the scales. You can then download a newly adjusted, fair dataset to train your future AI models on safely.

- **Scoring**: You get an overall system grade (A+, B-, etc.). This grade is based on:
  - **Testing Coverage:** How thoroughly your datasets have been tested.
  - **Risk Level:** Whether your datasets showed "Low" or "High" bias risk.
  - **Fairness Gate:** If any mission-critical workflows are currently being blocked due to high-risk bias.

### 4. Enterprise Audit
*Go to the **Enterprise** tab at the top.*

Need an official report? The Enterprise feature allows you to upload **both** a workflow file and its corresponding dataset at once. You provide the context of what the system does, run both the Security tests and the Fairness tests, and TokenFlow will generate a combined, saveable report. You can use this for internal compliance reviews or auditing.

---

## Frequently Asked Questions

**Does the AI read my raw data?**
The AI (Gemini) strictly processes numerical summaries and aggregated metric logic. It never reads individual raw rows of your uploaded datasets.

**What happens if a workflow is blocked?**
It acts like a "kill-switch." Once TokenFlow detects misuse (e.g., the AI tries to read a repo it shouldn't), the workflow is killed, and an immutable log is recorded in the Security tab for auditing.

**How do I make my dataset score better?**
Go to Governance -> Fairness, upload your datasets, run analyses for them to discover any risk, and utilize the Mitigation tool to clear blocked execution gates.

Enjoy a safer, fairer AI experience with TokenFlow!
