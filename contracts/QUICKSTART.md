# VibePay Contracts — Quickstart

Get the full Soroban workspace building and testing locally in a few commands.

## 1. Toolchain

`rust-toolchain.toml` pins Rust 1.88.0 automatically. If you haven't installed that toolchain yet:

```bash
rustup toolchain install 1.88.0
rustup target add wasm32-unknown-unknown
rustup component add clippy rustfmt
```

Install Soroban CLI only when you need deployment or manual contract invocation:

```bash
cargo install --locked soroban-cli
```

## 2. First validation run

From the `contracts/` directory, verify the entire workspace compiles and all tests pass:

```bash
cd contracts
cargo test --workspace
```

Expected output: every package's test suite runs; no failures.

## 3. Build all WASM artifacts

```bash
cargo build --workspace --target wasm32-unknown-unknown --release
```

Compiled `.wasm` files land in `target/wasm32-unknown-unknown/release/`.

## 4. Work on a single package

Replace `<package>` with any name from [WORKSPACE_OVERVIEW.md](WORKSPACE_OVERVIEW.md):

```bash
cargo test -p <package>
cargo build -p <package> --target wasm32-unknown-unknown --release
cargo clippy -p <package> -- -D warnings
cargo fmt -p <package> -- --check
```

Example for `fan-token`:

```bash
cargo test -p fan-token
cargo build -p fan-token --target wasm32-unknown-unknown --release
```

## 5. Where to go next

| Goal | File |
| :--- | :--- |
| Understand every package | [WORKSPACE_OVERVIEW.md](WORKSPACE_OVERVIEW.md) |
| Full CI-parity test matrix | [TESTING.md](TESTING.md) |
| Pre-PR checklist | [CHECKLIST.md](CHECKLIST.md) |
| Deploy a contract | [README.md](README.md#deployment) |
