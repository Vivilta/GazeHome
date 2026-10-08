/**
 * Component: SurveyModal
 * Post-experiment subjective evaluation using 1-5 Likert scales and dwell time preference
 */

import React, { useState } from 'react';
import { X, CheckCircle, FileSpreadsheet, Send } from 'lucide-react';
import { SurveyData, DwellTimeOption } from '../types';
import { generateSurveyCsv, downloadFile } from '../utils/csv';

interface SurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  participantId: string;
  onSaveSurvey: (data: SurveyData) => void;
  existingSurveys: SurveyData[];
}

const LIKERT_QUESTIONS = [
  { key: 'q1', text: '1. The interface was easy to use.' },
  { key: 'q2', text: '2. The gaze control was responsive.' },
  { key: 'q3', text: '3. I felt in control of the appliances.' },
  { key: 'q4', text: '4. The dwell selection was comfortable.' },
  { key: 'q5', text: '5. I would be comfortable using this interface for smart-home control.' },
];

export const SurveyModal: React.FC<SurveyModalProps> = ({
  isOpen,
  onClose,
  participantId,
  onSaveSurvey,
  existingSurveys,
}) => {
  const [q1, setQ1] = useState<number>(4);
  const [q2, setQ2] = useState<number>(3);
  const [q3, setQ3] = useState<number>(4);
  const [q4, setQ4] = useState<number>(4);
  const [q5, setQ5] = useState<number>(4);
  const [preferredDwell, setPreferredDwell] = useState<DwellTimeOption>(1.0);
  const [comments, setComments] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: SurveyData = {
      participant: participantId,
      q1_easy_to_use: q1,
      q2_responsive: q2,
      q3_in_control: q3,
      q4_dwell_comfortable: q4,
      q5_smart_home_acceptance: q5,
      preferredDwellTime: preferredDwell,
      comments: comments.trim(),
      submittedAt: new Date().toISOString(),
    };
    onSaveSurvey(data);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 1200);
  };

  const handleExportSurveysCsv = () => {
    if (existingSurveys.length === 0) {
      alert('No survey responses recorded yet.');
      return;
    }
    const csv = generateSurveyCsv(existingSurveys);
    downloadFile(csv, `gazehome_surveys_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              Post-Experiment Questionnaire
            </h3>
            <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {participantId}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Evaluate your subjective experience with the gaze-dwell interface (1 = Strongly Disagree, 5 = Strongly Agree).
          </p>
        </div>

        {submitted ? (
          <div className="py-12 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <h4 className="text-lg font-bold text-slate-900">Survey Saved!</h4>
            <p className="text-xs text-slate-500">
              Your questionnaire feedback has been appended to the current evaluation session.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Likert Scale Questions */}
            <div className="space-y-4">
              {[
                { label: 'The interface was easy to use.', val: q1, set: setQ1 },
                { label: 'The gaze control was responsive.', val: q2, set: setQ2 },
                { label: 'I felt in control of the appliances.', val: q3, set: setQ3 },
                { label: 'The dwell selection was comfortable.', val: q4, set: setQ4 },
                {
                  label: 'I would be comfortable using this interface for smart-home control.',
                  val: q5,
                  set: setQ5,
                },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1.5 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
                  <div className="text-xs font-semibold text-slate-800">
                    {idx + 1}. {item.label}
                  </div>
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                      Strongly Disagree
                    </span>
                    <div className="flex items-center gap-2 sm:gap-3 mx-auto sm:mx-0">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <label
                          key={score}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold cursor-pointer transition-all border ${
                            item.val === score
                              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${idx}`}
                            value={score}
                            checked={item.val === score}
                            onChange={() => item.set(score)}
                            className="sr-only"
                          />
                          <span>{score}</span>
                        </label>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                      Strongly Agree
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Preferred Dwell Time */}
            <div className="space-y-1.5 bg-slate-50/80 p-3 rounded-xl border border-slate-100">
              <label className="text-xs font-semibold text-slate-800 block">
                Preferred Dwell Time Condition:
              </label>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {([0.5, 1.0, 1.5] as DwellTimeOption[]).map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setPreferredDwell(time)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-all ${
                      preferredDwell === time
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                    }`}
                  >
                    {time.toFixed(1)} s
                  </button>
                ))}
              </div>
            </div>

            {/* Qualitative Feedback */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 block">
                Additional Qualitative Comments (Optional):
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="User experience notes, fatigue, target sizing, or calibration feedback..."
                className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 h-16 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              {existingSurveys.length > 0 && (
                <button
                  type="button"
                  onClick={handleExportSurveysCsv}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export Survey CSV ({existingSurveys.length})</span>
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Responses</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
