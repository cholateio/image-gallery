'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { Search, ChevronsUp, RotateCw, ChevronRight, ChevronLeft, X } from 'lucide-react';

// Hook for Debouncing - delay an action until the user has stopped typing for a specific amount of time
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        // Set up a timer to update the debounced value after the specified delay
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        // Clean up the previous timer if the value changes before the delay has passed
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// Hooks for columns and mobile detection
const useLayoutConfig = () => {
    const [config, setConfig] = useState({ columns: 2, isMobile: false });

    useEffect(() => {
        const updateConfig = () => {
            const width = window.innerWidth;
            let cols = 2;
            if (width >= 1280) cols = 7;
            else if (width >= 1024) cols = 5;
            else if (width >= 768) cols = 4;

            setConfig({
                columns: cols,
                isMobile: width < 768,
            });
        };

        updateConfig(); // Initial check
        window.addEventListener('resize', updateConfig);
        return () => window.removeEventListener('resize', updateConfig);
    }, []);

    return config;
};

const GalleryClient = () => {
    // State
    const [images, setImages] = useState([]); // An array to store all the image objects fetched from Supabase
    const [page, setPage] = useState(1); // A number to keep track of which page of results to fetch for infinite scrolling
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [hasMore, setHasMore] = useState(true); // A boolean to know if there are more images to load from the database
    const [selectedImage, setSelectedImage] = useState(null); // Stores the image object that the user clicks on to open in the full-screen modal
    const [rotation, setRotation] = useState(0);
    const [showScrollTopButton, setShowScrollTopButton] = useState(false);

    // Hooks & Refs
    const { columns: numColumns, isMobile } = useLayoutConfig();
    const debouncedSearchTerm = useDebounce(searchTerm, 500); // Wait 500ms after user stops typing
    const observerTarget = useRef(null); // 用於無限捲動的錨點
    const isFirstRender = useRef(true);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    const PAGE_LIMIT = 14; // A constant defining how many images to fetch per request

    // Heart of data fetching logic, useCallback to prevent it from being recreated on every component render
    const loadImages = useCallback(async (currentPage, term) => {
        setLoading(true);
        const isNewSearch = currentPage === 1;

        try {
            // 使用 Supabase RPC 呼叫資料庫端的隨機排序函數
            const { data, error } = await supabase.rpc('get_random_media', {
                p_search_term: term.trim().toLowerCase(),
                p_limit: PAGE_LIMIT,
                p_offset: (currentPage - 1) * PAGE_LIMIT,
            });

            if (error) throw error;

            const formattedImages = data.map((img) => ({
                id: img.id,
                url: img.gcs_url,
                title: img.tags ? img.tags[0] : 'Untitled',
                source: img.source || 'Unknown',
                date: new Date(img.created_at).toLocaleDateString(),
                tags: img.tags || [],
                width: img.width,
                height: img.height,
            }));

            setImages((prev) => {
                if (isNewSearch) return formattedImages;

                // 關鍵優化：過濾重複 ID，因為 DB 的 random() 在分頁時不保證唯一性，前端必須再次過濾
                const existingIds = new Set(prev.map((img) => img.id));
                const uniqueNewImages = formattedImages.filter((img) => !existingIds.has(img.id));
                return [...prev, ...uniqueNewImages];
            });

            // 如果回傳數量少於請求數量，代表沒資料了
            setHasMore(formattedImages.length === PAGE_LIMIT);

            // 只有在成功載入後才增加頁數 (由 Effect 控制或在此控制皆可，這裡選擇讓 Effect 不依賴 page 增加)
            if (formattedImages.length > 0) setPage(currentPage + 1);
        } catch (error) {
            console.error('Error fetching images:', error);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, []);

    // Search effect now depends on the debounced term
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            loadImages(1, debouncedSearchTerm);
            return;
        }
        // This effect now triggers only after the user has paused typing
        setPage(1);
        setHasMore(true);
        loadImages(1, debouncedSearchTerm);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedSearchTerm, loadImages]);

    // Infinite scroll effect (使用 Intersection Observer 取代 scroll event)
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading && page > 1) {
                    loadImages(page, debouncedSearchTerm);
                }
            },
            { threshold: 1.0, rootMargin: '200px' } // 提早 200px 觸發
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) observer.disconnect();
        };
    }, [hasMore, loading, page, debouncedSearchTerm, loadImages]);

    // 顯示回到頂部按鈕 (這個還是需要 scroll 監聽，但頻率低且邏輯簡單)
    useEffect(() => {
        const handleScroll = () => setShowScrollTopButton(window.pageYOffset > 500);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // When the modal is open, it sets overflow: 'hidden' on the <body> element to prevent the background from scrolling
    useEffect(() => {
        document.body.style.overflow = selectedImage ? 'hidden' : 'auto';
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [selectedImage]);

    // This hook efficiently organizes the flat images array into a nested array of columns for your masonry layout
    const columns = useMemo(() => {
        const newColumns = Array.from({ length: numColumns }, () => []);
        images.forEach((image, index) => {
            newColumns[index % numColumns].push(image);
        });
        return newColumns;
    }, [images, numColumns]);

    // Functions for user interaction, primarily related to the image modal
    const handleCloseModal = () => {
        setSelectedImage(null);
        setRotation(0);
    };
    const handleTagClick = (tag) => {
        setSearchTerm(tag); // The debounce hook will handle the rest
        handleCloseModal();
    };

    // Functions for going to next or prev image in modal
    const currentImageIndex = selectedImage ? images.findIndex((img) => img.id === selectedImage.id) : -1;

    const navigateImage = useCallback(
        (direction) => {
            const newIndex = currentImageIndex + direction;
            if (newIndex >= 0 && newIndex < images.length) {
                setSelectedImage(images[newIndex]);
                setRotation(0);
            }
        },
        [currentImageIndex, images]
    );

    // Keyboard support
    useEffect(() => {
        if (!selectedImage) return;
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') navigateImage(1);
            if (e.key === 'ArrowLeft') navigateImage(-1);
            if (e.key === 'Escape') handleCloseModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImage, navigateImage]);

    // Touch Swipe Support
    const handleTouchStart = (e) => {
        touchEndX.current = 0;
        touchStartX.current = e.targetTouches[0].clientX;
    };
    const handleTouchEnd = () => {
        if (!touchEndX.current) return;
        const deltaX = touchEndX.current - touchStartX.current;
        if (deltaX > 50) navigateImage(-1); // Swipe Right -> Prev
        if (deltaX < -50) navigateImage(1); // Swipe Left -> Next
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.8, duration: 0.4, ease: 'easeIn' } }}
            className="min-h-[100vh] p-4 sm:p-6 lg:p-8"
        >
            <div className="mx-auto">
                <h1 className="text-3xl font-bold text-center mb-6">My Image Gallery</h1>
                {/* Search Bar */}
                <div className="mb-8 relative max-w-2xl mx-auto">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search by tag..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 pr-12 py-3 border border-gray-300 rounded-full shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                            aria-label="Clear search"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>

                {/* Masonry Grid */}
                <div className="flex gap-4 items-start">
                    {columns.map((columnImages, colIndex) => (
                        <div key={colIndex} className="flex flex-col gap-4 flex-1">
                            {columnImages.map((image, idx) => (
                                <motion.div
                                    key={image.id}
                                    layoutId={`img-${image.id}`}
                                    className="relative rounded-lg overflow-hidden shadow-md hover:shadow-xl cursor-pointer group"
                                    onClick={() => setSelectedImage(image)}
                                >
                                    <Image
                                        src={image.url}
                                        alt={image.title}
                                        width={image.width}
                                        height={image.height}
                                        className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                                        sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                                        placeholder="blur"
                                        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" // 簡單的佔位符
                                        unoptimized={true}
                                    />
                                </motion.div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Status & Sentinel */}
                <div className="py-8 text-center text-gray-500">
                    {!loading && images.length === 0 && (
                        <p>{debouncedSearchTerm ? `No results for "${debouncedSearchTerm}"` : 'Gallery is empty.'}</p>
                    )}

                    {/* 這是 Intersection Observer 的觸發點 */}
                    <div ref={observerTarget} className="h-4 w-full" />

                    {loading && <p>Loading more...</p>}
                    {!hasMore && images.length > 0 && <p>End of gallery</p>}
                </div>
            </div>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 transition-opacity duration-300"
                    onClick={handleCloseModal}
                >
                    {!isMobile && (
                        <>
                            {currentImageIndex > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateImage(-1);
                                    }}
                                    className="absolute left-8 text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
                                >
                                    <ChevronLeft size={48} />
                                </button>
                            )}
                            {currentImageIndex < images.length - 1 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateImage(1);
                                    }}
                                    className="absolute right-8 text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
                                >
                                    <ChevronRight size={48} />
                                </button>
                            )}
                        </>
                    )}

                    <div
                        className="relative p-4 bg-gray-900 bg-opacity-50 rounded-lg flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                        onTouchStart={handleTouchStart}
                        onTouchMove={(e) => (touchEndX.current = e.targetTouches[0].clientX)}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="relative max-w-[90vw] max-h-[80vh] w-auto h-auto aspect-w-1 aspect-h-1">
                            <Image
                                src={selectedImage.url}
                                alt={selectedImage.title}
                                width={selectedImage.width} // Use the direct width
                                height={selectedImage.height} // Use the direct height
                                className="object-contain rounded-lg shadow-2xl transition-transform duration-300 ease-in-out pointer-events-none max-w-[90vw] max-h-[80vh] h-auto sm:w-auto"
                                style={{ transform: `rotate(${rotation}deg)` }}
                                sizes="90vw"
                            />
                        </div>
                        <p className="text-white text-center mt-3 font-semibold">{selectedImage.title}</p>
                        <p className="text-gray-300 text-center text-sm">
                            {selectedImage.date} - from {selectedImage.source}
                        </p>
                    </div>

                    <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-3">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setRotation((r) => (r + 90) % 360);
                            }}
                            className="bg-white bg-opacity-30 hover:bg-opacity-50 text-black font-bold p-2 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
                            aria-label="Rotate image"
                        >
                            <RotateCw className="text-xl" />
                        </button>
                        <div className="flex flex-col gap-2 items-end mt-2">
                            {selectedImage.tags.map((tag) => (
                                <button
                                    key={tag}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleTagClick(tag);
                                    }}
                                    className="md:my-1 bg-gray-700 bg-opacity-80 hover:bg-blue-600 text-white text-xs font-semibold py-2 px-4 rounded-full transition-colors duration-200"
                                >
                                    #{tag}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            {/* Scroll Top Button */}
            {showScrollTopButton && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-8 right-8 bg-blue-600 text-white p-3 rounded-full shadow-xl hover:scale-110 transition z-40"
                >
                    <ChevronsUp size={24} />
                </button>
            )}
        </motion.div>
    );
};

export default GalleryClient;
