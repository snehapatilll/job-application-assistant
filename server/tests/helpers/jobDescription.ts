/**
 * The posting used across the analysis tests.
 *
 * Deliberately paired with tests/fixtures/resume.pdf: the resume evidences
 * TypeScript, Node, PostgreSQL, Docker, AWS and Terraform, and says nothing
 * about Kubernetes, Kafka or GraphQL — so a correct analysis has both matched
 * and missing skills, and the live test can assert on specific ones.
 */
export const JOB_DESCRIPTION = `Senior Backend Engineer — Payments Platform

We are looking for a backend engineer to own the services behind our payments
and invoicing platform. You will design APIs, tune PostgreSQL queries, and help
move the remaining pieces of our legacy Ruby stack onto Node.js.

Requirements:
- Strong TypeScript and Node.js experience, ideally with Express.
- Deep PostgreSQL knowledge: query tuning, indexing, transactions.
- Experience operating services on AWS, with infrastructure as code.
- Comfort with Docker and containerised deployments.

Nice to have:
- Kubernetes experience.
- Exposure to Kafka or another streaming platform.
- Experience with GraphQL federation.
- A track record of mentoring other engineers.`;
