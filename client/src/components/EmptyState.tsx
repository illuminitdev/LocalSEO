export default function EmptyState({ title, body }: { title: string; body: string }) {
    return (
        <div className="bg-white border border-dashed border-[#E7E5E4] rounded-2xl p-10 text-center">
            <h3 className="font-bold text-[#2D2F27]">{title}</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">{body}</p>
        </div>
    );
}
