# Running the database on Amazon RDS

The app originally used [Neon](https://neon.tech). It now runs against a
PostgreSQL instance on Amazon RDS, placed in a private subnet with no route to
the internet and reached through AWS Systems Manager.

Nothing in the application code is specific to either provider — the pool takes
a `DATABASE_URL` and two optional TLS settings. See
[Database connection and TLS](../README.md#database-connection-and-tls) for
what those settings mean; this document covers the infrastructure around them,
and the two things that went wrong while building it.

## Why this shape

```
┌─ VPC 10.0.0.0/16 ───────────────────────────────────┐
│                                                      │
│  public subnet (AZ-a)        private subnet (AZ-a)  │
│  ┌──────────────┐            ┌──────────────┐       │
│  │ bastion EC2  │   :5432    │ RDS          │       │
│  │ t3.micro     ├───────────►│ db.t4g.micro │       │
│  │ SSM agent    │            │ no public IP │       │
│  │ NO inbound   │            └──────────────┘       │
│  └──────┬───────┘            private subnet (AZ-b)  │
│         │ outbound 443        ┌──────────────┐      │
└─────────┼─────────────────────│ (subnet group│──────┘
          ▼                     │  spans 2 AZs)│
   Internet Gateway             └──────────────┘
          │
  AWS Systems Manager  ◄── the operator connects through here
```

The bastion has **no inbound security group rules at all**. The SSM agent opens
an outbound HTTPS connection to AWS and holds it; sessions are pushed down that
existing connection. There is no SSH port to scan and no key pair to manage.

Three choices are worth stating explicitly:

- **The database is in private subnets.** Their route table has no
  `0.0.0.0/0` entry, so there is no path to or from the internet regardless of
  what else is misconfigured.
- **The RDS security group allows 5432 from the bastion's security group**, not
  from an IP range. The bastion's public IP changes every time it is stopped and
  started; a group-to-group rule keeps working untouched.
- **No NAT Gateway.** It is the default in the VPC creation wizard, costs about
  $32/month, and nothing here needs it — the database has no reason to make
  outbound connections.

## Cost

On a new account the AWS Free Tier covers 750 hours/month of RDS and 750 of EC2
as separate allowances for 12 months, so this runs at no cost. A month is ~730
hours, which leaves no slack if both run continuously — stop the bastion when
not working.

Four things will produce a bill, in the order people hit them:

| Trap | Cost | Avoided by |
| ---- | ---- | ---------- |
| NAT Gateway (the VPC wizard's default) | ~$32/mo | choosing **VPC only** |
| VPC interface endpoints for SSM | ~$21/mo | putting the bastion in a *public* subnet |
| Multi-AZ RDS | 2× | Single-AZ |
| Bastion left running | 744 hrs/mo | `aws ec2 stop-instances` |

Set a zero-spend budget under Billing → Budgets **before** creating anything.

## Build order

Region throughout: `ap-south-1`. Names below are the ones this project uses.

### 1. Network

1. VPC → Create VPC → **VPC only**. Name `jaa-vpc`, CIDR `10.0.0.0/16`.
2. Select it → Actions → Edit VPC settings → enable **DNS hostnames**.
   Off by default on custom VPCs; without it the RDS endpoint will not resolve.
3. Four subnets:

   | Name | AZ | CIDR |
   | ---- | -- | ---- |
   | `jaa-public-a` | ap-south-1a | `10.0.1.0/24` |
   | `jaa-public-b` | ap-south-1b | `10.0.2.0/24` |
   | `jaa-private-a` | ap-south-1a | `10.0.11.0/24` |
   | `jaa-private-b` | ap-south-1b | `10.0.12.0/24` |

   Two private subnets are required even for a single-AZ instance: an RDS
   subnet group must span two availability zones.
4. Enable **auto-assign public IPv4** on the two public subnets only.
5. Create internet gateway `jaa-igw` and attach it to the VPC.
6. Create route table `jaa-public-rt` with a `0.0.0.0/0` route to `jaa-igw`,
   associated with the two public subnets only. Leave the private subnets on
   the main route table, which has no internet route.

### 2. Security groups

| Group | Inbound | Purpose |
| ----- | ------- | ------- |
| `jaa-bastion-sg` | *(none)* | attached to the bastion; SSM is outbound-only |
| `jaa-rds-sg` | TCP 5432 from `jaa-bastion-sg` | attached to the database |

The source on the RDS rule is the bastion's **group**, not a CIDR.

### 3. Database

1. RDS → Subnet groups → Create. Name `jaa-db-subnets`, VPC `jaa-vpc`, both
   availability zones, and **only the two private subnets**.
2. RDS → Databases → Create database → **Full configuration** → PostgreSQL →
   template **Free tier**.
3. Settings: identifier `jaa-db`, master username, strong password,
   `db.t4g.micro`, 20 GB, storage autoscaling off.
4. Connectivity: DB subnet group `jaa-db-subnets`, **Public access: No**,
   security group `jaa-rds-sg` (remove `default`).
5. Additional configuration → **Initial database name** `jobassistant`.
   This section is collapsed by default and is easy to miss; see
   [Initial database name](#the-initial-database-name-is-create-time-only) below.

### 4. Bastion

1. IAM → Roles → Create role → AWS service → EC2 → attach
   `AmazonSSMManagedInstanceCore` → name `jaa-bastion-role`.
   Create this **before** launching the instance.
2. EC2 → Launch instance: name `jaa-bastion`, Amazon Linux 2023, `t3.micro`,
   **proceed without a key pair**.
3. Network: VPC `jaa-vpc`, subnet `jaa-public-a`, auto-assign public IP
   enabled, security group `jaa-bastion-sg`.
4. Advanced details → IAM instance profile → `jaa-bastion-role`.
5. Confirm registration:

   ```bash
   aws ssm describe-instance-information \
     --query "InstanceInformationList[].{Id:InstanceId,Ping:PingStatus}"
   ```

   `PingStatus` must be `Online`. If the instance never appears, the cause is
   either the missing IAM role or a subnet with no route to the internet
   gateway.

### 5. Connect

```bash
aws ssm start-session \
  --target <instance-id> \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters host="<rds-endpoint>",portNumber="5432",localPortNumber="5433"
```

Leave it running; the tunnel lives as long as the command does. Local port
5433 avoids colliding with a locally installed PostgreSQL.

### 6. Point the app at it

```bash
curl -o server/certs/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

The bundle is fetched rather than committed: Amazon rotates these, and a stale
copy in version control is worse than none. `server/certs/*.pem` is gitignored.

```
DATABASE_URL=postgresql://<user>:<password>@localhost:5433/jobassistant
DATABASE_CA_FILE=certs/rds-global-bundle.pem
DATABASE_TLS_SERVERNAME=<rds-endpoint>
```

Percent-encode `@ : / ? # %` and spaces if the password contains them, or the
URL parser will read them as delimiters.

```bash
cd server && npm run db:setup && npm run db:verify && npm test
```

## Operating it

```bash
aws ec2 stop-instances  --instance-ids <instance-id>   # when finished
aws ec2 start-instances --instance-ids <instance-id>   # before working
```

The public IP changes on each start. Nothing needs updating, because the
database's firewall rule references the bastion's security group rather than an
address.

## What went wrong, and why

Both of these cost real time and neither produced an error that pointed at its
own cause.

### Express configuration silently uses the default VPC

The RDS console offers **Express configuration** and **Full configuration**
(previously "Easy create" and "Standard create"). Express never shows the VPC,
the subnet group, or the initial database name. It places the instance in the
account's default VPC.

The symptom was not an error. It was the security group dropdown offering only
`default` — because the form was scoped to the default VPC, where
`jaa-rds-sg` does not exist. The instance was created in the default VPC's
public subnets, with none of the isolation above.

In the RDS console the VPC (or, in newer layouts, the DB subnet group that
implies it) determines every list below it. When a dropdown is missing the
entry you expect, check what VPC the form is scoped to before anything else.

### The initial database name is create-time only

`DBName` cannot be added by modifying an existing instance. Missing it is not
fatal, though: RDS always creates a `postgres` database, so connecting to that
one and running `CREATE DATABASE jobassistant;` reaches the same end state.

### TLS through a tunnel: setting `servername` is not enough

Connecting through the port forward means dialling `localhost` while the
certificate names the RDS endpoint, so the hostname check fails:

```
ERR_TLS_CERT_ALTNAME_INVALID: Host: localhost. is not in the cert's altnames:
DNS:jaa-db.xxxxx.ap-south-1.rds.amazonaws.com
```

The obvious fix — setting `servername` to the real endpoint — does not work on
its own, because `pg` overwrites `servername` with the host it actually dialled
before handing options to `tls.connect`. The check still runs against
`localhost`.

`server/src/db/pool.ts` therefore also overrides `checkServerIdentity` to verify
against the configured endpoint name. The CA chain is verified either way; this
only redirects *which hostname* the certificate is checked against — from the
one dialled to the one expected.

The widely-suggested alternative, `rejectUnauthorized: false`, resolves the
error by accepting any certificate at all, including one presented by an
attacker. It is not used here.

## Teardown

Delete in this order or AWS refuses the request:

1. RDS instance (skip the final snapshot, untick retain automated backups)
2. EC2 bastion
3. Security groups
4. Subnets
5. Internet gateway — detach, then delete
6. VPC

Past the 12-month free tier this stack costs roughly $15/month if left running.
