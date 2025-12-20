import React, { useState } from 'react';
import { X, Upload, Camera, Loader, CheckCircle } from 'lucide-react';
import type { Recipe } from '../../types';

interface CreateModalProps {
  onClose: () => void;
  onSave: (recipe: Recipe) => void;
}

type CreateTab = 'youtube' | 'photo';
type CreateStep = 'input' | 'generating' | 'editing';

export function CreateModal({ onClose, onSave }: CreateModalProps) {
  const [activeTab, setActiveTab] = useState<CreateTab>('youtube');
  const [step, setStep] = useState<CreateStep>('input');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [generatingProgress, setGeneratingProgress] = useState('');
  
  // Editing fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [ingredients, setIngredients] = useState<Array<{ name: string; amount: string }>>([]);
  const [steps, setSteps] = useState<Array<{ text: string }>>([]);

  const handleGenerate = async () => {
    setStep('generating');
    
    // Simulate generation process
    const progressSteps = [
      'Fetching transcript...',
      'Extracting ingredients...',
      'Writing steps...',
      'Finalizing recipe...'
    ];

    for (let i = 0; i < progressSteps.length; i++) {
      setGeneratingProgress(progressSteps[i]);
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Mock generated data
    setTitle('Classic Carbonara');
    setDescription('Authentic Italian carbonara with guanciale and pecorino romano.');
    setDuration('25 min');
    setCuisine('Italian');
    setIngredients([
      { name: 'Spaghetti', amount: '400g' },
      { name: 'Guanciale', amount: '200g' },
      { name: 'Egg yolks', amount: '4' },
      { name: 'Pecorino Romano', amount: '100g' },
      { name: 'Black pepper', amount: '2 tsp' },
    ]);
    setSteps([
      { text: 'Bring a large pot of salted water to boil' },
      { text: 'Cut guanciale into small cubes and render in a pan' },
      { text: 'Whisk egg yolks with grated pecorino and black pepper' },
      { text: 'Cook spaghetti until al dente' },
      { text: 'Toss pasta with guanciale, remove from heat, add egg mixture' },
    ]);

    setStep('editing');
  };

  const handleSave = () => {
    const newRecipe: Recipe = {
      id: Date.now().toString(),
      title,
      thumbnail: 'https://images.unsplash.com/photo-1739417083034-4e9118f487be?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwYXN0YSUyMGRpc2glMjBpdGFsaWFufGVufDF8fHx8MTc2NjAwNjYyNnww&ixlib=rb-4.1.0&q=80&w=1080',
      isPublic: false,
      duration,
      cuisine,
      cookbookIds: [],
      createdAt: new Date(),
      youtubeUrl: activeTab === 'youtube' ? youtubeUrl : undefined,
      description,
      ingredients,
      steps,
      userId: 'user1',
    };
    onSave(newRecipe);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-gray-900">Create Recipe</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        {step === 'input' && (
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('youtube')}
              className={`flex-1 px-6 py-4 transition-colors ${
                activeTab === 'youtube'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              From YouTube
            </button>
            <button
              onClick={() => setActiveTab('photo')}
              className={`flex-1 px-6 py-4 transition-colors ${
                activeTab === 'photo'
                  ? 'border-b-2 border-orange-500 text-orange-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              From Photo
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'input' && (
            <>
              {activeTab === 'youtube' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      YouTube URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  {youtubeUrl && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h3 className="text-gray-900 text-sm mb-2">Preview</h3>
                      <div className="flex gap-3">
                        <div className="w-32 h-20 bg-gray-300 rounded flex-shrink-0"></div>
                        <div>
                          <div className="text-gray-900 mb-1">Detected Video Title</div>
                          <div className="text-sm text-gray-600">Channel Name • 12:34</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleGenerate}
                    disabled={!youtubeUrl}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Generate recipe
                  </button>
                </div>
              )}

              {activeTab === 'photo' && (
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <label className="block text-sm text-gray-700 mb-2">
                      Upload recipe photo
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-orange-500 transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="file-upload"
                      />
                      <label htmlFor="file-upload" className="cursor-pointer">
                        {uploadedImage ? (
                          <div className="space-y-3">
                            <img
                              src={uploadedImage}
                              alt="Uploaded"
                              className="max-h-64 mx-auto rounded-lg"
                            />
                            <p className="text-sm text-gray-600">Click to change image</p>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-700 mb-2">Drop your image here or click to browse</p>
                            <p className="text-sm text-gray-500">Supports JPG, PNG, HEIC</p>
                          </>
                        )}
                      </label>
                    </div>
                  </div>

                  <button
                    className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-3 rounded-lg transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    Use camera
                  </button>

                  <button
                    onClick={handleGenerate}
                    disabled={!uploadedImage}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Extract recipe
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'generating' && (
            <div className="max-w-md mx-auto text-center py-16">
              <Loader className="w-16 h-16 text-orange-500 mx-auto mb-6 animate-spin" />
              <h3 className="text-gray-900 mb-2">{generatingProgress}</h3>
              <p className="text-gray-600 text-sm">This may take a few moments...</p>
            </div>
          )}

          {step === 'editing' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-2">Duration</label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Cuisine</label>
                <input
                  type="text"
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Ingredients</label>
                <div className="space-y-2">
                  {ingredients.map((ing, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={ing.amount}
                        onChange={(e) => {
                          const newIng = [...ingredients];
                          newIng[idx].amount = e.target.value;
                          setIngredients(newIng);
                        }}
                        placeholder="Amount"
                        className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <input
                        type="text"
                        value={ing.name}
                        onChange={(e) => {
                          const newIng = [...ingredients];
                          newIng[idx].name = e.target.value;
                          setIngredients(newIng);
                        }}
                        placeholder="Ingredient"
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-700 mb-2">Steps</label>
                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <div className="w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                        {idx + 1}
                      </div>
                      <textarea
                        value={step.text}
                        onChange={(e) => {
                          const newSteps = [...steps];
                          newSteps[idx].text = e.target.value;
                          setSteps(newSteps);
                        }}
                        rows={2}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'editing' && (
          <div className="p-4 md:p-6 border-t border-gray-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 md:px-6 py-2 text-gray-600 hover:text-gray-900 transition-colors text-sm md:text-base"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-1 sm:flex-none px-4 md:px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-sm md:text-base"
              >
                <CheckCircle className="w-4 h-4 md:w-5 md:h-5" />
                Save recipe
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
