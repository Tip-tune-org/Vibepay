# VibePay Smart Contracts

Soroban smart contracts for the VibePay platform. The workspace contains **19 packages** — `tip-escrow` is one of them.

## Documentation

- [Workspace overview](WORKSPACE_OVERVIEW.md) — every package, its purpose, build/test commands
- [Quickstart](QUICKSTART.md) — get the workspace running in minutes
- [Testing & linting guide](TESTING.md)
- [Contributor checklist](CHECKLIST.md)
- [Docs index](../docs/README.md)

## Prerequisites

- Rust 1.88.0 (`rust-toolchain.toml` pins this automatically)
- `wasm32-unknown-unknown` target
- Soroban CLI (deployment / manual invocation only)

```bash
rustup target add wasm32-unknown-unknown
rustup component add clippy rustfmt
cargo install --locked soroban-cli   # optional, for deployment
```

## Build

Build every contract in the workspace:

```bash
cd contracts
cargo build --workspace --target wasm32-unknown-unknown --release
```

Build a single package:

```bash
cargo build -p tip-escrow --target wasm32-unknown-unknown --release
```

## Test

Run all tests across the workspace:

```bash
cd contracts
cargo test --workspace
```

Run tests for a single package:

```bash
cargo test -p tip-escrow
```

## Workspace packages

See [WORKSPACE_OVERVIEW.md](WORKSPACE_OVERVIEW.md) for the full package list with purposes and per-package commands.

## Deployment

```bash
# Generate / import a Soroban identity
soroban keys generate default --network testnet

# Deploy a single contract (example)
cd contracts/tip-escrow
./deploy.sh                    # testnet (default)
NETWORK=mainnet ./deploy.sh    # mainnet
```

The deployed contract ID is saved to `.contract-id` in the package directory. Add it to your backend `.env`:

```env
STELLAR_TIP_ESCROW_CONTRACT=C...
```

See [../docs/environment-reference.md](../docs/environment-reference.md) for all environment variables.

## Security

- All tip transfers require sender authorization
- Royalty splits are validated (max 100 %)
- Audit recommended before mainnet deployment

## License

MIT
