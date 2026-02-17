# Support

Thank you for using Kubectl UI! If you find this tool useful, please consider giving the repository a ⭐ star on [GitHub](https://github.com/sapod/Kubutctl-UI) to show your support and help others discover it. Feel free to share it with friends and colleagues who work with Kubernetes!

If you encounter any issues or need help, please follow the guidelines below.

## Getting Help

### Before Opening an Issue

1. **Check Existing Issues**: Search through [existing issues](https://github.com/sapod/Kubutctl-UI/issues) to see if your problem has already been reported or resolved.

2. **Check the Documentation**: Review the [README.md](README.md) and [RELEASE-NOTES.md](RELEASE-NOTES.md) for usage instructions and recent changes.

3. **Try Basic Troubleshooting**:
   - Restart the application
   - Check that `kubectl` is properly installed and configured on your system
   - Verify your kubeconfig file is valid and accessible
   - Ensure you have the necessary permissions to access your Kubernetes clusters

## Common Issues

### Application Won't Start

**Problem**: The application fails to launch or crashes immediately.

**Solutions**:
- On macOS: Remove the quarantine attribute: `xattr -cr /Applications/Kubectl-UI.app`
- Check the console logs for error messages
- Ensure you have the latest version installed
- Try deleting the app cache and preferences (see "Clearing Cache" below)

### Connection Issues

**Problem**: Cannot connect to Kubernetes cluster.

**Solutions**:
- Verify `kubectl` works from your terminal: `kubectl cluster-info`
- Check your kubeconfig file: `kubectl config view`
- Ensure your cluster context is set correctly: `kubectl config current-context`
- Verify network connectivity to your cluster

### Update Issues

**Problem**: Auto-update fails or shows errors.

**Solutions**:
- Use the manual update option from the Help menu
- Download the latest version from [releases page](https://github.com/sapod/Kubutctl-UI/releases/latest)
- On macOS, you may need to remove quarantine attributes after manual installation
- Clear the update cache: Run the script `scripts/clear-update-cache.sh`

### Logs Window Issues

**Problem**: Undocked logs window doesn't display correctly or opens in the wrong location.

**Solutions**:
- Try closing and reopening the logs window
- If the window appears on the wrong monitor, dock and undock it again
- Restart the application to reset window positions

### Performance Issues

**Problem**: Application runs slowly or becomes unresponsive.

**Solutions**:
- Close unused log streams
- Reduce the number of pods being monitored simultaneously
- Clear application cache (see "Clearing Cache" below)
- Restart the application

## Clearing Cache

If you're experiencing persistent issues, try clearing the application cache:

### macOS
```bash
# Clear application data
rm -rf ~/Library/Application\ Support/kubectl-ui

# Clear cache
rm -rf ~/Library/Caches/kubectl-ui

# Clear preferences (this will reset your settings)
defaults delete com.electron.kubectl-ui
```

### Linux
```bash
# Clear application data
rm -rf ~/.config/kubectl-ui

# Clear cache
rm -rf ~/.cache/kubectl-ui
```

### Windows
```powershell
# Clear application data
Remove-Item -Recurse -Force "$env:APPDATA\kubectl-ui"

# Clear cache
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\kubectl-ui"
```

## Reporting Issues

If you've tried the above solutions and still have problems, please open an issue on GitHub.

### How to Report an Issue

1. **Go to the Issues Page**: Visit [github.com/sapod/Kubutctl-UI/issues](https://github.com/sapod/Kubutctl-UI/issues)

2. **Click "New Issue"**: Start creating a new issue

3. **Provide a Clear Title**: Use a descriptive title that summarizes the problem

4. **Include Detailed Information**:
   - **Kubectl UI Version**: Found in the app menu or About section
   - **Operating System**: macOS/Windows/Linux version
   - **kubectl Version**: Run `kubectl version --client`
   - **Node.js Version** (if running from source): Run `node --version`
   - **Description**: What you expected to happen vs. what actually happened
   - **Steps to Reproduce**: Detailed steps to recreate the issue
   - **Screenshots**: If applicable, include screenshots showing the problem
   - **Console Logs**: Check the developer console (View → Toggle Developer Tools) for errors

### Example Issue Report

```markdown
**Title**: Application crashes when viewing logs from pod with special characters

**Version**: 2.6.0
**OS**: macOS 14.2.1
**kubectl**: v1.29.0

**Description**:
The application crashes immediately when I try to view logs from a pod whose name contains special characters like parentheses.

**Steps to Reproduce**:
1. Navigate to a namespace with a pod named "app-worker-(staging)"
2. Click on the pod to view details
3. Click "View Logs"
4. Application crashes

**Expected**: Logs should display normally
**Actual**: Application crashes with error: [paste error message]

**Screenshots**: [attach screenshot]
```

## Feature Requests

Have an idea for a new feature? We'd love to hear it!

1. Check if the feature has already been requested in [existing issues](https://github.com/sapod/Kubutctl-UI/issues)
2. If not, open a new issue with the "enhancement" label
3. Clearly describe:
   - The feature you'd like to see
   - The problem it would solve
   - How you envision it working
   - Any examples from other tools (if applicable)

## Contributing

Interested in contributing to Kubectl UI? Check out our [README.md](README.md) for development setup instructions.

## Contact

- **GitHub Issues**: [github.com/sapod/Kubutctl-UI/issues](https://github.com/sapod/Kubutctl-UI/issues)
- **Repository**: [github.com/sapod/Kubutctl-UI](https://github.com/sapod/Kubutctl-UI)

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [kubectl Cheat Sheet](https://kubernetes.io/docs/reference/kubectl/cheatsheet/)
- [kubectl Documentation](https://kubernetes.io/docs/reference/kubectl/)

---

Thank you for using Kubectl UI! Your feedback helps make this tool better for everyone.

