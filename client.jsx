'use client';
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Search, ChevronsUp, RotateCw, ChevronRight, ChevronLeft, X } from 'lucide-react';

const BLUR_PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const DEFAULT_ENTRANCE = { delay: 0.8, duration: 0.4, ease: 'easeIn' };
const EMPTY = {};

const useLayoutConfig = () => {
    const [config, setConfig] = useState({ columns: 2, isMobile: false });

    useEffect(() => {
        const updateConfig = () => {
            const width = window.innerWidth;
            let columns = 2;
            if (width >= 1280) columns = 7;
            else if (width >= 1024) columns = 5;
            else if (width >= 768) columns = 4;
            const isMobile = width < 768;
            setConfig((prev) => (prev.columns === columns && prev.isMobile === isMobile ? prev : { columns, isMobile }));
        };

        updateConfig();
        window.addEventListener('resize', updateConfig);
        return () => window.removeEventListener('resize', updateConfig);
    }, []);

    return config;
};

const GalleryItem = memo(function GalleryItem({ image, index, unoptimized, onSelect }) {
    return (
        <div
            className="relative rounded-lg overflow-hidden shadow-md hover:shadow-xl cursor-pointer group"
            onClick={() => onSelect(index)}
        >
            <Image
                src={image.url}
                alt={image.title}
                width={image.width ?? 1}
                height={image.height ?? 1}
                className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
                placeholder="blur"
                blurDataURL={BLUR_PIXEL}
                unoptimized={unoptimized}
            />
        </div>
    );
});

const MasonryGrid = memo(function MasonryGrid({ columns, unoptimized, onSelect }) {
    return (
        <div className="flex gap-4 items-start">
            {columns.map((items, colIndex) => (
                <div key={colIndex} className="flex flex-col gap-4 flex-1">
                    {items.map(({ image, index }) => (
                        <GalleryItem key={image.id} image={image} index={index} unoptimized={unoptimized} onSelect={onSelect} />
                    ))}
                </div>
            ))}
        </div>
    );
});

const formatRow = (row) => ({
    id: row.id,
    url: row.gcs_url,
    title: row.tags?.[0] ?? 'Untitled',
    source: row.source || 'Unknown',
    date: new Date(row.created_at).toLocaleDateString(),
    tags: row.tags || [],
    width: row.width,
    height: row.height,
    sortKey: row.sort_key,
});

const newSeed = () => Math.random().toString(36).slice(2);

const GalleryClient = ({
    supabase,
    rpc = 'get_random_media',
    pageSize = 14,
    title = 'My Image Gallery',
    unoptimizedThumbnails = true,
    entrance = DEFAULT_ENTRANCE,
    motionProps = EMPTY,
    className = 'min-h-[100vh] p-4 sm:p-6 lg:p-8',
}) => {
    const [images, setImages] = useState([]);
    const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'error'
    const [hasMore, setHasMore] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTerm, setActiveTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(null);
    const [rotation, setRotation] = useState(0);
    const [showScrollTopButton, setShowScrollTopButton] = useState(false);

    const { columns: numColumns, isMobile } = useLayoutConfig();
    const observerTarget = useRef(null);
    const prevTerm = useRef(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // One search = one seed + keyset cursor. requestId changes on every new search so a
    // late response from an earlier search is dropped; pending holds the requestId whose
    // request is in flight so a second trigger in the same tick does not double-fetch.
    const cursor = useRef({ seed: '', term: '', afterKey: null, afterId: null, requestId: 0 });
    const pending = useRef(null);

    const fetchPage = useCallback(async () => {
        const { seed, term, afterKey, afterId, requestId: myId } = cursor.current;
        if (pending.current === myId) return;
        pending.current = myId;
        setStatus('loading');

        const { data, error } = await supabase.rpc(rpc, {
            p_seed: seed,
            p_search_term: term,
            p_limit: pageSize,
            p_after_key: afterKey,
            p_after_id: afterId,
        });

        if (pending.current === myId) pending.current = null;
        if (myId !== cursor.current.requestId) return;

        if (error) {
            console.error('Error fetching images:', error);
            setStatus('error');
            return;
        }

        const rows = data.map(formatRow);
        setImages((prev) => (afterKey === null ? rows : [...prev, ...rows]));
        // A replaced list invalidates the viewer's index into it.
        if (afterKey === null) {
            setSelectedIndex(null);
            setRotation(0);
        }
        if (rows.length > 0) {
            const last = rows[rows.length - 1];
            cursor.current.afterKey = last.sortKey;
            cursor.current.afterId = last.id;
        }
        setHasMore(rows.length === pageSize);
        setStatus('idle');
    }, [supabase, rpc, pageSize]);

    // The first page of a search replaces the list when it arrives (fetchPage), so nothing
    // is cleared here and the old images stay visible while the new ones load.
    const startSearch = useCallback(
        (term) => {
            cursor.current = {
                seed: newSeed(),
                term,
                afterKey: null,
                afterId: null,
                requestId: cursor.current.requestId + 1,
            };
            setActiveTerm(term);
            setHasMore(true);
            fetchPage();
        },
        [fetchPage]
    );

    // Debounce: the search starts 500 ms after typing stops, immediately on mount.
    useEffect(() => {
        const term = searchTerm.trim().toLowerCase();
        const first = prevTerm.current === null;
        const handle = setTimeout(
            () => {
                if (!first && prevTerm.current !== term) window.scrollTo({ top: 0, behavior: 'smooth' });
                prevTerm.current = term;
                startSearch(term);
            },
            first ? 0 : 500
        );
        return () => clearTimeout(handle);
    }, [searchTerm, startSearch]);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return undefined;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && status === 'idle') fetchPage();
            },
            { threshold: 1.0, rootMargin: '200px' }
        );
        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, status, fetchPage]);

    useEffect(() => {
        const handleScroll = () => setShowScrollTopButton(window.pageYOffset > 500);
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const selectedImage = selectedIndex === null ? null : images[selectedIndex];

    useEffect(() => {
        if (!selectedImage) return undefined;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [selectedImage]);

    // Shortest-column placement keyed on aspect ratio: equal-width columns make a column's
    // height proportional to the sum of height/width. Deterministic, so appending a page
    // never moves earlier images.
    const columns = useMemo(() => {
        const cols = Array.from({ length: numColumns }, () => ({ items: [], height: 0 }));
        images.forEach((image, index) => {
            let target = cols[0];
            for (let i = 1; i < cols.length; i += 1) if (cols[i].height < target.height) target = cols[i];
            target.items.push({ image, index });
            target.height += (image.height || 1) / (image.width || 1);
        });
        return cols.map((c) => c.items);
    }, [images, numColumns]);

    const openImage = useCallback((index) => {
        setSelectedIndex(index);
        setRotation(0);
    }, []);
    const closeModal = useCallback(() => {
        setSelectedIndex(null);
        setRotation(0);
    }, []);
    const navigateImage = useCallback(
        (direction) => {
            setSelectedIndex((current) => {
                if (current === null) return current;
                const next = current + direction;
                return next >= 0 && next < images.length ? next : current;
            });
            setRotation(0);
        },
        [images.length]
    );
    const handleTagClick = (tag) => {
        setSearchTerm(tag);
        closeModal();
    };

    useEffect(() => {
        if (!selectedImage) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowRight') navigateImage(1);
            if (e.key === 'ArrowLeft') navigateImage(-1);
            if (e.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedImage, navigateImage, closeModal]);

    const handleTouchStart = (e) => {
        touchEndX.current = 0;
        touchStartX.current = e.targetTouches[0].clientX;
    };
    const handleTouchEnd = () => {
        if (!touchEndX.current) return;
        const deltaX = touchEndX.current - touchStartX.current;
        if (deltaX > 50) navigateImage(-1);
        if (deltaX < -50) navigateImage(1);
    };

    return (
        <motion.div
            {...motionProps}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: entrance }}
            className={className}
        >
            <div className="mx-auto">
                {title ? <h1 className="text-3xl font-bold text-center mb-6">{title}</h1> : null}
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

                <MasonryGrid columns={columns} unoptimized={unoptimizedThumbnails} onSelect={openImage} />

                <div className="py-8 text-center text-gray-500">
                    {status === 'idle' && images.length === 0 && (
                        <p>{activeTerm ? `No results for "${activeTerm}"` : 'Gallery is empty.'}</p>
                    )}

                    <div ref={observerTarget} className="h-4 w-full" />

                    {status === 'loading' && <p>Loading more...</p>}
                    {status === 'error' && (
                        <p>
                            Loading failed.{' '}
                            <button onClick={fetchPage} className="underline hover:text-gray-700">
                                Retry
                            </button>
                        </p>
                    )}
                    {status === 'idle' && !hasMore && images.length > 0 && <p>End of gallery</p>}
                </div>
            </div>

            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 transition-opacity duration-300"
                    onClick={closeModal}
                >
                    {!isMobile && (
                        <>
                            {selectedIndex > 0 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateImage(-1);
                                    }}
                                    className="absolute left-8 text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
                                    aria-label="Previous image"
                                >
                                    <ChevronLeft size={48} />
                                </button>
                            )}
                            {selectedIndex < images.length - 1 && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateImage(1);
                                    }}
                                    className="absolute right-8 text-white/70 hover:text-white p-2 hover:bg-white/10 rounded-full transition"
                                    aria-label="Next image"
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
                        <div className="relative max-w-[90vw] max-h-[80vh] w-auto h-auto">
                            <Image
                                src={selectedImage.url}
                                alt={selectedImage.title}
                                width={selectedImage.width ?? 1}
                                height={selectedImage.height ?? 1}
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
            {showScrollTopButton && (
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className="fixed bottom-8 right-8 bg-blue-600 text-white p-3 rounded-full shadow-xl hover:scale-110 transition z-40"
                    aria-label="Scroll to top"
                >
                    <ChevronsUp size={24} />
                </button>
            )}
        </motion.div>
    );
};

export default GalleryClient;
