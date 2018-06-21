<?php # -*- coding: utf-8 -*-
/*
 * This file is part of the MultilingualPress package.
 *
 * (c) Inpsyde GmbH
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Inpsyde\MultilingualPress\Flags\Flag;

use Inpsyde\MultilingualPress\Framework\Language\Language;

/**
 * Class Svg
 *
 * @todo Convert to SVG markup
 */
final class Svg implements Flag
{
    /**
     * @var int
     */
    private $siteId;

    /**
     * @var Language
     */
    private $language;

    /**
     * @var string
     */
    private $url;

    /**
     * Svg constructor
     * @param int $siteId
     * @param Language $language
     * @param string $url
     */
    public function __construct(int $siteId, Language $language, string $url)
    {
        $this->siteId = $siteId;
        $this->language = $language;
        $this->url = $url;
    }

    /**
     * @inheritdoc
     */
    public function url(): string
    {
        return $this->url;
    }

    /**
     * @inheritdoc
     */
    public function markup(): string
    {
        return '';
    }
}
