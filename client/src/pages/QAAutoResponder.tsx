import { useState } from 'react';
import { Database, HelpCircle, Save, Sparkles, CheckCircle2 } from 'lucide-react';
import { apiPost, logDashboardActivity } from '../lib/utils';
import EmptyState from '../components/EmptyState';

interface Question {
    id: number;
    text: string;
    author: string;
    answer: string;
    status: 'pending' | 'drafted' | 'published';
}

export default function QAAutoResponder() {
    const [kbText, setKbText] = useState('');
    const [questions, setQuestions] = useState<Question[]>([]);
    const [newQuestion, setNewQuestion] = useState('');
    const [isGenerating, setIsGenerating] = useState<number | null>(null);
    const [isSavingKB, setIsSavingKB] = useState(false);
    const [error, setError] = useState('');

    const addQuestion = () => {
        if (!newQuestion.trim()) return;
        setQuestions((prev) => [
            { id: Date.now(), text: newQuestion.trim(), author: 'Customer', answer: '', status: 'pending' },
            ...prev
        ]);
        setNewQuestion('');
    };

    const handleAutoAnswer = async (id: number, text: string) => {
        setIsGenerating(id);
        setError('');
        try {
            const data = await apiPost('/api/ai/qa-answer', { question: text, kb: kbText });
            setQuestions(prev => prev.map(q => q.id === id ? { ...q, answer: data.answer, status: 'drafted' } : q));
        } catch (err: any) {
            setError(err.message || 'Answer failed');
        } finally {
            setIsGenerating(null);
        }
    };

    const handleSaveAnswerDraft = async (id: number) => {
        setQuestions(prev => prev.map(q => q.id === id ? { ...q, status: 'published' } : q));
        const targetQ = questions.find(q => q.id === id);
        if (!targetQ) return;
        await logDashboardActivity({
            type: 'qa',
            message: `Saved Q&A draft: ${targetQ.text}`,
            icon: 'CheckCircle',
            color: 'text-[#F59E0B]'
        });
    };

    const handleSaveKB = async () => {
        setIsSavingKB(true);
        setError('');
        await logDashboardActivity({
            type: 'knowledge',
            message: 'Saved business knowledge base.',
            icon: 'Activity',
            color: 'text-[#0F172A]'
        });
        setIsSavingKB(false);
    };

    return (
        <div className="max-w-6xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Q&A Auto-Responder</h1>
                <p className="text-gray-500 mt-2">Paste only real facts. Gemini will not invent policies.</p>
            </div>
            {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-5">
                    <div className="bg-white rounded-2xl border border-[#E2E8F0] flex flex-col overflow-hidden">
                        <div className="p-5 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center gap-2">
                            <Database className="w-5 h-5 text-[#0F172A]" />
                            <h2 className="font-bold">Business Knowledge Base</h2>
                        </div>
                        <div className="p-5">
                            <textarea
                                value={kbText}
                                onChange={(e) => setKbText(e.target.value)}
                                placeholder="Parking, insurance, hours, cancellation — only facts you confirm."
                                className="w-full h-64 p-4 text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl"
                            />
                            <div className="mt-4 flex justify-end">
                                <button onClick={handleSaveKB} disabled={isSavingKB} className="flex items-center gap-2 px-5 py-2.5 border border-[#E2E8F0] rounded-xl font-bold cursor-pointer">
                                    <Save className="w-4 h-4" /> {isSavingKB ? 'Saving...' : 'Save Context'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-7 space-y-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-[#D97706]" /> Questions
                    </h2>
                    <div className="flex gap-2">
                        <input
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="Add a real customer question"
                            className="flex-1 px-4 py-2.5 border border-[#E2E8F0] rounded-xl bg-white"
                        />
                        <button onClick={addQuestion} className="px-4 py-2.5 bg-[#0F172A] text-white rounded-xl font-bold cursor-pointer">Add</button>
                    </div>

                    {!questions.length && <EmptyState title="No questions" body="Add a customer question, then generate an answer from your knowledge base." />}

                    {questions.map(q => (
                        <div key={q.id} className="bg-white p-5 rounded-2xl border border-[#E2E8F0]">
                            <p className="font-bold">"{q.text}"</p>
                            {q.status === 'pending' ? (
                                <div className="pt-4 flex justify-end">
                                    <button onClick={() => handleAutoAnswer(q.id, q.text)} disabled={isGenerating === q.id} className="flex items-center gap-2 px-4 py-2 border border-[#F59E0B]/40 rounded-lg font-bold cursor-pointer">
                                        <Sparkles className={`w-4 h-4 ${isGenerating === q.id ? 'animate-spin' : ''}`} />
                                        {isGenerating === q.id ? 'Thinking...' : 'Auto-Answer via KB'}
                                    </button>
                                </div>
                            ) : q.status === 'drafted' ? (
                                <div className="pt-4">
                                    <textarea value={q.answer} onChange={(e) => setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, answer: e.target.value } : item))} className="w-full text-sm border border-[#E2E8F0] p-3 rounded-lg h-24" />
                                    <div className="flex justify-end mt-2">
                                        <button onClick={() => handleSaveAnswerDraft(q.id)} className="px-4 py-2 bg-[#F59E0B] text-white rounded-lg font-bold cursor-pointer flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" /> Save answer draft
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="mt-3 text-sm bg-[#F1F5F9] p-3 rounded-lg">{q.answer}</p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
