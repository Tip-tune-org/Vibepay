# Waveform Architecture Decision Record

* **Status**: Accepted
* **Complexity**: Medium (120)
* **Created**: 2026-04-27
* **Authors**: Backend Team
* **Reviewers**: Architecture Team

---

## Problem

Historical documentation described the waveform module in isolation and did not explain the coexistence of two waveform implementations: `src/waveform` and `src/mount-waveform`. This created ambiguity about which implementation was canonical and the rationale for having duplicates.

## Context

The VibePay backend has had two parallel waveform implementations:

1. **`src/waveform`** (original) - Initial implementation using CLI-based generation with basic job queueing
2. **`src/mount-waveform`** (duplicate) - Refactored implementation with improved BullMQ-based queueing and tracking logic

Both modules provided identical functionality (generating waveform visualization data for audio tracks) but with different internal architectures and reliability characteristics.

The duplicate existed because:
- The original `waveform` module had reliability and tracking limitations
- A separate team created `mount-waveform` as a ground-up rewrite with better queue management
- Both implementations coexisted temporarily during migration planning
- The `mount-waveform` name indicated it was meant to "mount" or replace the original

## Decision

**Consolidate into a single canonical module at `src/waveform`.**

The improvements from `mount-waveform` (BullMQ-based queueing, better error tracking, DLQ integration) were merged into the original `src/waveform` directory in commit `037bb31`. The `src/mount-waveform` directory was deleted after consolidation.

**Canonical path today**: `backend/src/waveform/`

**Key merged improvements**:
- BullMQ queue with Redis persistence
- Exponential backoff retry logic
- Dedicated worker (`WaveformProcessor`)
- DLQ (Dead Letter Queue) support for failed jobs
- Enhanced status tracking (`GenerationStatus` enum)
- Job correlation IDs (`bullJobId`)

## Architecture Overview

The consolidated module consists of:

```
backend/src/waveform/
├── waveform.module.ts          # NestJS module declaration
├── waveform.service.ts         # High-level domain logic, enqueues jobs
├── waveform-generator.service.ts  # Low-level CLI wrapper (audiowaveform)
├── waveform.processor.ts       # BullMQ worker host
├── waveform.controller.ts      # REST API endpoints
├── waveform.constants.ts       # Queue names, job types, defaults
├── entities/
│   └── track-waveform.entity.ts    # TrackWaveform DB entity
├── dto/
│   └── waveform.dto.ts            # Request/response DTOs
└── README.md                  # Module documentation
```

**Services**:
- `WaveformService` - Orchestrates generation, persists results, exposes API
- `WaveformGeneratorService` - Shells out to `audiowaveform` CLI, normalizes data
- `WaveformProcessor` - Background worker that processes queued jobs

**Queue**: `WAVEFORM_QUEUE` (BullMQ with Redis)

**Database**: `track_waveforms` table with `generationStatus`, `waveformData` (jsonb), `bullJobId`, etc.

## Ownership

- **Module Owner**: Backend Team
- **Primary Contact**: @gabito1451 (original author), @xaxxoo (mount-waveform author)
- **Code Location**: `backend/src/waveform/`
- **API Prefix**: `/api/v1/tracks/:trackId/waveform`

## Consequences

### Positive
- Single source of truth for waveform functionality
- Improved reliability from BullMQ-based retry logic
- Better observability through job tracking and DLQ
- Reduced maintenance burden (one module to update)

### Negative
- Temporary duplication increased code churn during consolidation
- Historical confusion about which module to use
- `tsconfig.build.json` still excludes phantom `mount-waveform` path (legacy artifact)

## Cleanup Tasks (Future Work)

1. **Remove stale build exclusion** in `backend/tsconfig.build.json`:
   - Delete `"src/mount-waveform/**/*"` from `exclude` array (line 8)
   - This is now a no-op but should be cleaned up for clarity

2. **Update documentation references**:
   - `backend/README.md` - add Waveform to module list
   - `backend/src/waveform/README.md` - note consolidation status

3. **Verify imports**:
   - Ensure no code references `mount-waveform` (currently clean)

4. **Consider module rename**:
   - Optional: Rename `waveform` to `audio-waveform` for clarity
   - Requires migration of imports in `app.module.ts` and any consumers

5. **Integration test coverage**:
   - Ensure waveform generation is covered in end-to-end tests

## Validation

Compare this ADR against:
- `backend/src/waveform/` - current canonical implementation
- Git history: `3d9aafc` (mount-waveform introduction), `037bb31` (consolidation)
- `backend/tsconfig.build.json` - contains legacy exclusion for `mount-waveform`

## References

- Consolidation commit: `037bb31fd345cffd12eb8b4a6a151bc69e3dd5ff`
- Mount-waveform PR: #354
- Original waveform commit: `3781c46`
