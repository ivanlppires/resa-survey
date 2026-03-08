import type { SurveyStatus } from '@resa/shared'

const status: SurveyStatus = 'draft'

export default function App() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-gray-900">RESA Survey</h1>
        <p className="mt-2 text-gray-500">Status: {status}</p>
      </div>
    </div>
  )
}
