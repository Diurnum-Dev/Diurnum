.PHONY: test test-frontend test-e2e test-rust

test: test-frontend test-rust test-e2e

test-frontend:
	npm run typecheck
	npm test
	npm run build

test-e2e:
	npm run test:e2e

test-rust:
	cargo fmt --manifest-path src-tauri/Cargo.toml --check
	cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
	cargo test --manifest-path src-tauri/Cargo.toml
