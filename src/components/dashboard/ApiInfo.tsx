'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Label } from '@/components/ui/label'

interface ApiInfoProps {
    ingestUrl: string
    secretKey: string
}

export function ApiInfo({ ingestUrl, secretKey }: ApiInfoProps) {
    const [showKey, setShowKey] = useState(false)
    const [copiedUrl, setCopiedUrl] = useState(false)
    const [copiedKey, setCopiedKey] = useState(false)

    const handleCopy = (text: string, setCopied: (val: boolean) => void) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Conexão API</CardTitle>
                <CardDescription>Use estas credenciais para enviar eventos para a API de ingestão.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label>Endpoint de Ingestão</Label>
                    <div className="flex gap-2">
                        <Input value={ingestUrl} readOnly />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopy(ingestUrl, setCopiedUrl)}
                        >
                            {copiedUrl ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label>Chave Secreta (Bearer Token)</Label>
                    <div className="flex gap-2">
                        <Input
                            type={showKey ? 'text' : 'password'}
                            value={secretKey}
                            readOnly
                        />
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowKey(!showKey)}
                            title={showKey ? 'Ocultar' : 'Mostrar'}
                        >
                            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopy(secretKey, setCopiedKey)}
                        >
                            {copiedKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
