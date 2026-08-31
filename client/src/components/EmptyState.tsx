export default function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="bg-white border border-dashed border-[#E2E8F0] rounded-2xl p-10 text-center">
            <h3 className="font-bold text-[#0F172A]">{title}</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{body}</p>
        </div>
    );
}
