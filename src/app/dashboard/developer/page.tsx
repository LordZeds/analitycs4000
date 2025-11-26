import { ApiInfo } from '@/components/dashboard/ApiInfo'
import { EventLog } from '@/components/dashboard/EventLog'

export default function DeveloperPage() {
    // In a real scenario, these should be fetched securely or passed via props if this was a server component.
    // Since we are in a dashboard, we can expose the public URL.
    // The Secret Key is sensitive. For this demo/MVP, we will assume the user knows it or we display a placeholder/masked value
    // that they can replace or we fetch it if we decide to expose it (risky for client-side).
    // BETTER APPROACH: Pass it from Server Component.

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://analitycs.tiberioz.com.br'
    const ingestUrl = `${appUrl}/api/ingest`

    // WARNING: Exposing the secret key to the client is generally not recommended unless this is an admin dashboard
    // and we are sure only admins can access it. Since this IS the admin dashboard, we can pass it.
    // However, environment variables on the server are not automatically available to the client unless prefixed with NEXT_PUBLIC_.
    // We need to fetch it server-side and pass it down.

    return (
        <div className="p-8 space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900">Ferramentas de Desenvolvedor</h1>
                <p className="text-gray-500">Gerencie sua integração e monitore eventos.</p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-8">
                    <ServerApiInfoWrapper ingestUrl={ingestUrl} />
                </div>
                <div className="h-full">
                    <EventLog />
                </div>
            </div>
        </div>
    )
}

// Server Component Wrapper to safely access process.env
function ServerApiInfoWrapper({ ingestUrl }: { ingestUrl: string }) {
    const secretKey = process.env.INGEST_SECRET_KEY || 'sk_dev_...'
    return <ApiInfo ingestUrl={ingestUrl} secretKey={secretKey} />
}
