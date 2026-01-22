import React from 'react';
import { useStore } from '../store';
import { Grid, Rocket, Zap, Shield, Terminal } from 'lucide-react';

export const WelcomeScreen: React.FC = () => {
  const { dispatch } = useStore();

  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-8">
      <div className="max-w-4xl w-full">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-500/10 border-2 border-blue-500/30 mb-6">
            <Terminal className="w-10 h-10 text-blue-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">
            Welcome to <span className="text-blue-400">Kubectl-UI</span>
          </h1>
          <p className="text-xl text-gray-400 mb-8">
            A modern, intuitive interface for managing your Kubernetes clusters
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-4">
              <Rocket className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Fast & Responsive</h3>
            <p className="text-sm text-gray-400">
              Instant cluster switching with smart caching for a seamless experience
            </p>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-green-500/10 border border-green-500/30 mb-4">
              <Zap className="w-6 h-6 text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Real-time Updates</h3>
            <p className="text-sm text-gray-400">
              Live monitoring of pods, deployments, and services with auto-refresh
            </p>
          </div>

          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 hover:border-blue-500/50 transition-all">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-purple-500/10 border border-purple-500/30 mb-4">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Secure & Local</h3>
            <p className="text-sm text-gray-400">
              Uses your local kubectl config - no data leaves your machine
            </p>
          </div>
        </div>

        {/* Get Started Section */}
        <div className="bg-gray-800/70 border border-gray-700 rounded-xl p-8 backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">
            Get Started
          </h2>

          <div className="text-center">
            <button
              onClick={() => dispatch({ type: 'TOGGLE_CATALOG_MODAL', payload: true })}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-900/30"
            >
              <Grid size={18} />
              Open Cluster Catalog
            </button>
            <p className="text-xs text-gray-500 mt-3">
              Browse and manage all your Kubernetes clusters
            </p>
            <p className="text-sm text-gray-400 mt-3 italic">
              💡 You can also access the cluster catalog anytime by clicking the <Grid size={14} className="inline mx-1" /> icon at the top-left corner
            </p>
          </div>
        </div>

        {/* Footer Hint */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            💡 Tip: Your selected cluster will be remembered across sessions
          </p>
        </div>
      </div>
    </div>
  );
};

