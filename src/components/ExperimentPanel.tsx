/**
 * Component: ExperimentPanel
 * Manages participant session details, true descriptive metrics, trial history logs,
 * questionnaire entry, and CSV data export.
 */

import React from 'react';
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  ClipboardList,
  Info,
  User,
} from 'lucide-react';
import {
  TrialRecord,
  DwellTimeOption,
} from '../types';
import { generateTrialsCsv, downloadFile } from '../utils/csv';

interface ExperimentPanelProps {
  isRunning: boolean;
  isPaused: boolean;
  trials: TrialRecord[];
  dwellTime: DwellTimeOption;
  participantId: string;
  onParticipantIdChange: (id: string) => void;
  onClearTrials: () => void;
  onOpenSurvey: () => void;
}

export const ExperimentPanel: React.FC<ExperimentPanelProps> = ({
  isRunning,
  isPaused,
  trials,
  dwellTime,
  participantId,
  onParticipantIdChange,
  onClearTrials,
  onOpenSurvey,
}) => {
  // Compute authentic descriptive metrics strictly from recorded trials
  const totalTrials = trials.length;
  const correctTrials = trials.filter((t) => t.correct).length;
  const errorTrials = totalTrials - correctTrials;
  const accuracy = totalTrials > 0 ? (correctTrials / totalTrials) * 100 : 0;
  const errorRate = totalTrials > 0 ? (errorTrials / totalTrials) * 100 : 0;

  const correctTimes = trials.filter((t) => t.correct).map((t) => t.timeSeconds);
  const meanTime =
    correctTimes.length > 0
      ? correctTimes.reduce((acc, curr) => acc + curr, 0) / correctTimes.length
      : 0;

  const handleExportCsv = () => {
    if (trials.length === 0) {
      alert('No trial data available to export yet. Complete at least one trial first.');
      return;
    }
    const csv = generateTrialsCsv(trials);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(csv, `gazehome_trials_${participantId}_${dateStr}.csv`);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-5">
      {/* Participant Session Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span>Participant Session</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Condition: {dwellTime.toFixed(1)}s Dwell
          </p>
        </div>

        {/* Participant ID Input */}
        <div className="flex items-center gap-1.5">
          <label htmlFor="participant-id" className="text-xs font-semibold text-slate-600">
            ID:
          </label>
          <input
            id="participant-id"
            type="text"
            value={participantId}
            onChange={(e) => onParticipantIdChange(e.target.value.trim() || 'P01')}
            disabled={isRunning}
            className="w-20 px-2 py-1 text-xs font-mono font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-50 disabled:text-slate-400 text-center"
            placeholder="P01"
          />
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Collected Session Metrics
          </span>
          <span className="text-[10px] text-slate-400">
            {totalTrials} recorded
          </span>
        </div>

        {totalTrials === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center bg-slate-50/50">
            <Info className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">
              No trials recorded yet
            </p>
            <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-0.5">
              Run the active command above to log authentic reaction times and accuracy.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-medium text-slate-500 block uppercase">
                Accuracy
              </span>
              <span className="text-lg font-bold font-mono text-emerald-600 mt-0.5 block">
                {accuracy.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">
                {correctTrials}/{totalTrials} correct
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-medium text-slate-500 block uppercase">
                Error Rate
              </span>
              <span className="text-lg font-bold font-mono text-rose-600 mt-0.5 block">
                {errorRate.toFixed(1)}%
              </span>
              <span className="text-[10px] text-slate-400">
                {errorTrials} errors
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-medium text-slate-500 block uppercase">
                Mean Time
              </span>
              <span className="text-lg font-bold font-mono text-blue-600 mt-0.5 block">
                {meanTime.toFixed(2)} s
              </span>
              <span className="text-[10px] text-slate-400">
                Correct latency
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-[10px] font-medium text-slate-500 block uppercase">
                Condition
              </span>
              <span className="text-lg font-bold font-mono text-slate-800 mt-0.5 block">
                {dwellTime.toFixed(1)}s
              </span>
              <span className="text-[10px] text-slate-400">
                Dwell threshold
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons: Questionnaire & CSV Export */}
      <div className="pt-1 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenSurvey}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5 text-indigo-600" />
            <span>Survey</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={totalTrials === 0}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none border border-slate-200 rounded-lg shadow-2xs transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>
        </div>

        {totalTrials > 0 && !isRunning && (
          <button
            type="button"
            onClick={onClearTrials}
            className="text-[11px] text-slate-400 hover:text-slate-600 text-center py-1 transition-colors"
          >
            Clear current trial records
          </button>
        )}
      </div>

      {/* Real Trial Log Table */}
      {totalTrials > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              Trial History ({totalTrials})
            </span>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-1.5 px-2.5">#</th>
                  <th className="py-1.5 px-2">Target</th>
                  <th className="py-1.5 px-2">Result</th>
                  <th className="py-1.5 px-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...trials].reverse().map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80">
                    <td className="py-1.5 px-2.5 font-mono text-slate-400">{t.trialNumber}</td>
                    <td className="py-1.5 px-2 font-medium text-slate-800">
                      {t.commandTarget} ({t.requestedState})
                    </td>
                    <td className="py-1.5 px-2">
                      {t.correct ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>OK</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>ERR</span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-slate-700 text-right">
                      {t.timeSeconds.toFixed(2)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Academic Disclaimer */}
      <div className="text-[10px] text-slate-400 bg-slate-50 rounded-lg p-2 border border-slate-100">
        <strong>Academic Evaluation Note:</strong> Trial latency and accuracy scores are computed exclusively from live participant selections. No simulated results are fabricated.
      </div>
    </div>
  );
};
