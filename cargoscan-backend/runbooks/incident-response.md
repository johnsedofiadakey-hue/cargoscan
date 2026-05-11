# Runbook: Incident Response

**Scenario:** General incident response framework for security breaches, outages, or data loss.

## 1. Severity Levels
- **Sev 1**: Critical outage affecting all users (e.g., DB down).
- **Sev 2**: Major degradation affecting many users (e.g., WhatsApp down).
- **Sev 3**: Minor issue affecting a small subset of users.

## 2. Response Steps
1. **Triage**: Identify the severity and impact.
2. **Containment**: Stop the bleeding (e.g., block malicious IP, rollback bad deploy).
3. **Resolution**: Fix the root cause.
4. **Comms**: Update the status page and notify affected users.
5. **Postmortem**: Document what happened, why, and how to prevent it.

## 3. Comms Templates
- **Initial**: "We are investigating reports of issues with [service]. Our team is on it."
- **Update**: "We have identified the issue and are working on a fix."
- **Resolved**: "The issue has been resolved. All systems are operational."
