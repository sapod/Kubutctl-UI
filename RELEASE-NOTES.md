# Release Notes

## Version 2.6.0

### Features
- Added full support for DaemonSets and StatefulSets workloads
- Added full support for Secrets (view, decode/encode, and management)
- Added YAML search capability in resource drawer

### Improvements
- Improved logs panel to work with all workloads (Deployment/DaemonSet/StatefulSet)
- Improve caching in logs for better experience and storage optimization

### Bug Fixes
- Fixed z-index values in UI to ensure proper layering of modals and overlays
- Fixed drawer not closing on AWS SSO authentication error, now closes automatically to display error message clearly
- Fixed logs panel pod selection not being preserved after page reload if pod not in cache
- Fixed environment variables not showing secret references in pod drawer

### Breaking Changes
- None

---

<!-- Template for future releases:

## Version X.Y.Z

### Features
- New feature description

### Improvements
- Improvement description

### Bug Fixes
- Bug fix description

### Breaking Changes
- Breaking change description (if any)

-->

