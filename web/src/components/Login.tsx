import { useState } from 'react';

interface LoginProps {
    onLogin: () => void;
}

export const Login = ({ onLogin }: LoginProps) => {
    const [user, setUser] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (user.toLowerCase().trim() === 'evar' && password === 'miamor') {
            onLogin();
        } else {
            setError('Usuario o contraseña incorrectos.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-sm w-full p-8 rounded-3xl shadow-lg border border-gray-100 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">El Jardín ERP</h1>
                    <p className="text-gray-500 mt-2 text-sm">Capa de Seguridad Habilitada.</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Usuario Administrador</label>
                        <input
                            type="text"
                            value={user}
                            onChange={(e) => setUser(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-jardin-primary focus:border-transparent focus:outline-none transition-all"
                            placeholder="Usuario"
                            autoComplete="username"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-jardin-primary focus:border-transparent focus:outline-none transition-all"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>
                    
                    {error && (
                        <div className="text-rose-500 text-sm text-center font-medium bg-rose-50 rounded-xl p-3 animate-in shake">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-jardin-primary text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-jardin-primary/30 hover:shadow-jardin-primary/50 transition-all active:scale-95 mt-6"
                    >
                        Ingresar a la Plataforma
                    </button>
                </form>
            </div>
        </div>
    );
};
